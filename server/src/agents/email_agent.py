import os
import json
import sqlite3
import uuid
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.sqlite import SqliteSaver

from src.tools.gmail_tools import create_gmail_tools

load_dotenv()

# The checkpointer saves the graph state to SQLite after every step.
# We create it once at module level so the same connection is reused
# across all requests instead of opening a new file every time.
_DB_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..",
    "..",  # navigate from agents/ → src/ → server/
    "checkpoints.db",
)
_conn = sqlite3.connect(_DB_PATH, check_same_thread=False)
_checkpointer = SqliteSaver(_conn)

# Tools that require explicit human approval before executing
HITL_TOOLS = {"send_email", "reply_email", "delete_email"}


def build_system_prompt(user_name: str) -> str:
    """Returns the system prompt injected at the start of every conversation."""
    return f"""You are a dedicated, intelligent Gmail assistant for {user_name}. Your SOLE purpose is to help the user manage, read, search, draft, organize, and send their Gmail emails.

DOMAIN & SCOPE RESTRICTIONS:
- You ONLY handle email and Gmail-related tasks (such as searching emails, reading emails, summarizing messages, drafting replies, finding attachments, managing labels/folders, sending or deleting emails).
- If the user asks questions or gives instructions completely unrelated to their emails or Gmail workspace (e.g. general trivia, sports records, news, coding tutorials, math, creative writing, or general knowledge like "which team is better in cricket"), you MUST politely decline and remind them that you are strictly an email assistant.
- Example refusal: "I am your Gmail assistant, so I can only assist with managing, searching, reading, drafting, and organizing your emails. Let me know if you'd like help with anything in your inbox!"

You have access to full Gmail management tools:
- Search messages: search_emails(query)
- Read email details & body: read_email(message_id)
- Read thread conversations: get_thread(thread_id)
- Create draft without sending: create_draft(to, subject, body)
- Send new email: send_email(to, subject, body)
- Reply to conversation: reply_email(thread_id, body)
- Archive message: archive_email(message_id)
- Mark read/unread: mark_as_read(message_id), mark_as_unread(message_id)
- Label emails: add_label(message_id, label)
- Delete email: delete_email(message_id)

When listing or summarizing emails, always use this exact format for each email:

**1. Sender Name** (sender@email.com)
**Subject:** subject here
**Date:** date here
**Summary:** one or two sentence summary here

**2. Sender Name** (sender@email.com)
**Subject:** subject here
**Date:** date here
**Summary:** one or two sentence summary here

Rules:
- Always number emails sequentially: 1, 2, 3 ... never reset back to 1
- Never use bullet points (- or *) for email fields, always use **bold labels** like above
- Maintain conversational context across multiple turns; refer back to previously discussed emails, subjects, or people when the user asks follow-up questions
- For search, use Gmail search syntax (e.g. is:unread, from:someone@email.com, subject:keyword)
- When drafting or sending emails, always sign off with:
  Best Regards,
  {user_name}
- Be concise, accurate, and helpful"""


def _build_graph(refresh_token: str, access_token: str | None):
    """
    Builds and compiles the LangGraph ReAct graph for a specific user.

    Key settings:
    - checkpointer: saves state to SQLite so the graph can be paused and resumed
    - interrupt_before=["tools"]: pauses the graph before running any tool,
      giving us a chance to inspect the tool call and ask user approval if needed.
    """
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY is not set in environment variables.")

    llm = ChatGoogleGenerativeAI(
        model="gemini-3.5-flash-lite",
        # model="gemini-2.0-flash-lite",
        google_api_key=api_key,
        temperature=0.3,
    )

    tools = create_gmail_tools(
        refresh_token=refresh_token,
        access_token=access_token,
    )

    graph = create_react_agent(
        model=llm,
        tools=tools,
        checkpointer=_checkpointer,
        interrupt_before=["tools"],
    )

    return graph


def _get_pending_tool_calls(graph, config: dict) -> list:
    """
    Checks whether the graph is currently paused at the tools node.
    If yes, returns the list of tool calls the LLM wants to make.
    If no (graph finished), returns an empty list.
    """
    state = graph.get_state(config)
    if not state.next:
        return []
    last_msg = state.values["messages"][-1]
    return getattr(last_msg, "tool_calls", []) or []


def _extract_tools_used(graph, config: dict) -> list[str]:
    """
    Walks through all messages in the graph state and collects
    the unique names of every tool that was called during this run.
    """
    state = graph.get_state(config)
    tools_used: list[str] = []
    for msg in state.values.get("messages", []):
        for tc in getattr(msg, "tool_calls", []) or []:
            tool_name = (
                tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", None)
            )
            if tool_name and tool_name not in tools_used:
                tools_used.append(tool_name)
    return tools_used


def _sse(data: dict) -> str:
    """Formats a Python dict as a Server-Sent Events data line."""
    return f"data: {json.dumps(data)}\n\n"


def _stream_loop(graph, initial_input, config: dict, thread_id: str):
    """
    Streaming version of the agent run loop.

    Uses graph.stream() with stream_mode="messages" to get tokens
    from the LLM as they are generated, instead of waiting for the
    full response.

    Yields SSE-formatted strings:
      - {"type": "token",            "content": "..."}        — one LLM token
      - {"type": "done",             "tools_used": [...]}      — run complete
      - {"type": "pending_approval", "thread_id": "...", ...}  — needs human approval
      - {"type": "error",            "message": "..."}         — error occurred
    """
    current_input = initial_input

    while True:
        # Stream this iteration of the graph.
        for chunk, metadata in graph.stream(
            current_input, config, stream_mode="messages"
        ):
            # Only forward tokens coming from the agent node (the LLM).
            if metadata.get("langgraph_node") != "agent":
                continue

            content = getattr(chunk, "content", None)
            if not content:
                continue

            # Gemini sometimes sends content as a list of blocks rather than a string
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        text = block.get("text", "")
                        if text:
                            yield _sse({"type": "token", "content": text})
            elif isinstance(content, str):
                yield _sse({"type": "token", "content": content})

        # After each iteration, check if the graph paused before a tool
        pending_calls = _get_pending_tool_calls(graph, config)

        if not pending_calls:
            # No interrupt — graph has finished
            break

        # Check if any pending call is a Human-in-the-Loop action
        hitl_call = next((tc for tc in pending_calls if tc["name"] in HITL_TOOLS), None)

        if hitl_call:
            tool_name = hitl_call["name"]
            args = hitl_call.get("args", {})
            pending_action = {"tool": tool_name}

            if tool_name == "send_email":
                pending_action.update(
                    {
                        "to": args.get("to", ""),
                        "subject": args.get("subject", ""),
                        "body": args.get("body", ""),
                    }
                )
            elif tool_name == "reply_email":
                pending_action.update(
                    {
                        "thread_id": args.get("thread_id", ""),
                        "body": args.get("body", ""),
                    }
                )
            elif tool_name == "delete_email":
                pending_action.update(
                    {
                        "message_id": args.get("message_id", ""),
                    }
                )

            yield _sse(
                {
                    "type": "pending_approval",
                    "thread_id": thread_id,
                    "pending_action": pending_action,
                }
            )
            return
        else:
            # Safe tool (search, read, thread, draft, label, read/unread, archive) — auto-resume!
            current_input = None
            continue

    tools_used = _extract_tools_used(graph, config)
    yield _sse({"type": "done", "tools_used": tools_used})


def stream_agent_run(
    user_message: str,
    refresh_token: str,
    access_token: str | None,
    user_name: str = "the user",
    history: list[dict] | None = None,
):
    """
    Starts a new agent run and streams the response token by token.
    """
    thread_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    graph = _build_graph(refresh_token, access_token)

    # Build the messages list: system prompt → recent history → new message.
    messages = [SystemMessage(content=build_system_prompt(user_name))]

    if history:
        for msg in history:
            role = msg.get("role", "")
            content = msg.get("content", "")
            if not content:
                continue
            if role == "user":
                messages.append(HumanMessage(content=content))
            elif role == "assistant":
                messages.append(AIMessage(content=content))

    messages.append(HumanMessage(content=user_message))

    yield from _stream_loop(graph, {"messages": messages}, config, thread_id)


def stream_resume_agent_run(
    thread_id: str,
    approved: bool,
    refresh_token: str,
    access_token: str | None,
    user_name: str = "the user",
):
    """
    Resumes a paused graph and streams the response token by token.
    """
    config = {"configurable": {"thread_id": thread_id}}
    graph = _build_graph(refresh_token, access_token)

    if not approved:
        state = graph.get_state(config)
        last_msg = state.values["messages"][-1]
        pending_calls = getattr(last_msg, "tool_calls", []) or []

        # Create cancellation ToolMessages
        cancel_messages = [
            ToolMessage(
                tool_call_id=tc["id"],
                content="Action cancelled by the user. Do not attempt to perform this action again.",
            )
            for tc in pending_calls
        ]

        graph.update_state(config, {"messages": cancel_messages}, as_node="tools")

    yield from _stream_loop(graph, None, config, thread_id)
