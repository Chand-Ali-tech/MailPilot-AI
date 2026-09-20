import os
import json
import sqlite3
import uuid
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
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


def build_system_prompt(user_name: str) -> str:
    """Returns the system prompt injected at the start of every conversation."""
    return f"""You are an intelligent Gmail assistant for {user_name}. You help manage their emails.

You have access to Gmail tools to search emails and send emails.

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
- For search, use Gmail search syntax (e.g. is:unread, from:someone@email.com, subject:keyword)
- When sending emails, always sign off with:
  Best Regards,
  {user_name}
- Be concise and helpful"""


def _build_graph(refresh_token: str, access_token: str | None):
    """
    Builds and compiles the LangGraph ReAct graph for a specific user.

    Key settings:
    - checkpointer: saves state to SQLite so the graph can be paused and resumed
    - interrupt_before=["tools"]: pauses the graph before running any tool,
      giving us a chance to ask the user for approval
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
    the names of every tool that was called during this run.
    """
    state = graph.get_state(config)
    tools_used = []
    for msg in state.values.get("messages", []):
        for tc in getattr(msg, "tool_calls", []) or []:
            tools_used.append(tc["name"])
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
      - {"type": "pending_approval", "thread_id": "...", ...}  — needs human OK
      - {"type": "error",            "message": "..."}         — something went wrong
    """
    current_input = initial_input

    while True:
        # Stream this iteration of the graph.
        # stream_mode="messages" gives us (chunk, metadata) pairs where chunk
        # is an AIMessageChunk with partial content from the LLM.
        for chunk, metadata in graph.stream(
            current_input, config, stream_mode="messages"
        ):
            # Only forward tokens coming from the agent node (the LLM).
            # We skip tool result messages — those are not user-facing text.
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

        wants_to_send = any(tc["name"] == "send_email" for tc in pending_calls)

        if wants_to_send:
            # The LLM wants to send an email — pause and ask the user first.
            # Send a special SSE event so the frontend shows the approval card.
            send_call = next(tc for tc in pending_calls if tc["name"] == "send_email")
            yield _sse(
                {
                    "type": "pending_approval",
                    "thread_id": thread_id,
                    "pending_action": {
                        "tool": "send_email",
                        "to": send_call["args"].get("to", ""),
                        "subject": send_call["args"].get("subject", ""),
                        "body": send_call["args"].get("body", ""),
                    },
                }
            )
            return
        else:
            # Safe tool (e.g. search_emails) — auto-resume without asking the user.
            # Passing None as input tells LangGraph to continue from the checkpoint.
            current_input = None
            continue

    tools_used = _extract_tools_used(graph, config)
    yield _sse({"type": "done", "tools_used": tools_used})


def stream_agent_run(
    user_message: str,
    refresh_token: str,
    access_token: str | None,
    user_name: str = "the user",
):
    """
    Starts a new agent run and streams the response token by token.

    This is a generator — iterate it to get SSE strings to forward to the client.
    The frontend reads these and builds the message in real time.
    """
    thread_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    graph = _build_graph(refresh_token, access_token)

    initial_input = {
        "messages": [
            SystemMessage(content=build_system_prompt(user_name)),
            HumanMessage(content=user_message),
        ]
    }

    yield from _stream_loop(graph, initial_input, config, thread_id)


def stream_resume_agent_run(
    thread_id: str,
    approved: bool,
    refresh_token: str,
    access_token: str | None,
    user_name: str = "the user",
):
    """
    Resumes a paused graph and streams the response token by token.

    approved=True  → resume normally, send_email tool executes, email is sent
    approved=False → inject cancellation ToolMessages so the LLM responds
                     gracefully ("okay, I've cancelled it") instead of erroring
    """
    config = {"configurable": {"thread_id": thread_id}}
    graph = _build_graph(refresh_token, access_token)

    if not approved:
        state = graph.get_state(config)
        last_msg = state.values["messages"][-1]
        pending_calls = getattr(last_msg, "tool_calls", []) or []

        # Create one cancellation ToolMessage per pending tool call.
        # Each ToolMessage must reference the exact tool_call_id from the AIMessage
        # so LangGraph can match them up correctly.
        cancel_messages = [
            ToolMessage(
                tool_call_id=tc["id"],
                content="Action cancelled by the user. Do not attempt to send the email again.",
            )
            for tc in pending_calls
        ]

        # Push these into the graph state as if the tools node produced them.
        # as_node="tools" is required — it tells LangGraph which node these
        # messages are "coming from" so execution order stays correct.
        graph.update_state(config, {"messages": cancel_messages}, as_node="tools")

    yield from _stream_loop(graph, None, config, thread_id)
