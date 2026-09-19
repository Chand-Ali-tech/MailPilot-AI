import os
import sqlite3
import uuid
import traceback
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
- For search, use Gmail search syntax (e.g. is:unread, from:someone@email.com, subject:keyword)
- When listing emails, format them clearly with sender, subject, date, and a short summary
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
        model="gemini-3.6-flash",
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


def _extract_reply(graph, config: dict) -> str:
    """
    Gets the final AI message from the graph state and returns it as a
    plain string. Handles the case where Gemini returns content as a list
    of blocks instead of a single string.
    """
    state = graph.get_state(config)
    content = state.values["messages"][-1].content

    if isinstance(content, list):
        return " ".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in content
        )

    return str(content)


def _run_loop(graph, initial_input, config: dict, thread_id: str) -> dict:
    """
    Runs the graph step by step, handling interrupts intelligently:

    - If the graph pauses before a safe tool (search_emails): auto-resume.
      No human input needed — searching is read-only.

    - If the graph pauses before send_email: stop and return a
      "pending_approval" response so the user can review and approve.

    - If the graph finishes with no interrupts: return the final reply.
    """
    current_input = initial_input

    while True:
        graph.invoke(current_input, config)
        pending_calls = _get_pending_tool_calls(graph, config)

        # Graph has finished — no more tool calls pending
        if not pending_calls:
            break

        wants_to_send = any(tc["name"] == "send_email" for tc in pending_calls)

        if wants_to_send:
            # The LLM wants to send an email — pause and ask the user first
            send_call = next(tc for tc in pending_calls if tc["name"] == "send_email")
            return {
                "status": "pending_approval",
                "thread_id": thread_id,
                "pending_action": {
                    "tool": "send_email",
                    "to": send_call["args"].get("to", ""),
                    "subject": send_call["args"].get("subject", ""),
                    "body": send_call["args"].get("body", ""),
                },
            }
        else:
            # Safe tool (e.g. search_emails) — resume automatically
            current_input = (
                None  # passing None tells LangGraph to resume from checkpoint
            )
            continue

    reply = _extract_reply(graph, config)
    tools_used = _extract_tools_used(graph, config)
    return {"status": "complete", "reply": reply, "tools_used": tools_used}


def start_agent_run(
    user_message: str,
    refresh_token: str,
    access_token: str | None,
    user_name: str = "the user",
) -> dict:
    """
    Starts a brand new agent conversation for the given user message.

    Returns one of two shapes:
      - {"status": "complete", "reply": "...", "tools_used": [...]}
      - {"status": "pending_approval", "thread_id": "...", "pending_action": {...}}

    The thread_id in the second case must be sent back to resume_agent_run()
    once the user approves or cancels.
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

    return _run_loop(graph, initial_input, config, thread_id)


def resume_agent_run(
    thread_id: str,
    approved: bool,
    refresh_token: str,
    access_token: str | None,
    user_name: str = "the user",
) -> dict:
    """
    Resumes a graph that was paused waiting for human approval.

    approved=True:
        Resume normally. The tools node runs and the email is sent.

    approved=False:
        We inject fake ToolMessages saying the action was cancelled.
        The graph then resumes, the LLM reads those results, and replies
        with a graceful "okay, I've cancelled it" message — instead of crashing
        because no ToolMessage was provided for the pending tool calls.
    """
    config = {"configurable": {"thread_id": thread_id}}
    graph = _build_graph(refresh_token, access_token)

    if not approved:
        # Get the last AI message which contains the pending tool calls
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
        # messages are "coming from" so the execution order stays correct.
        graph.update_state(config, {"messages": cancel_messages}, as_node="tools")

    # Resume execution from the checkpoint (None = no new user input)
    return _run_loop(graph, None, config, thread_id)
