import os
import traceback
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.prebuilt import create_react_agent

from src.tools.gmail_tools import create_gmail_tools

load_dotenv()


def build_system_prompt(user_name: str) -> str:
    return f"""You are an intelligent Gmail assistant for {user_name}. You help manage their emails.

You have access to Gmail tools to search emails and send emails.
- For search, use Gmail search syntax (e.g. is:unread, from:someone@email.com, subject:keyword)
- When listing emails, format them clearly with sender, subject, date, and a short summary
- When sending emails, always sign off with:
  Best Regards,
  {user_name}
- Be concise and helpful"""


def run_email_agent(
    user_message: str,
    refresh_token: str,
    access_token: str | None = None,
    user_name: str = "the user",
) -> dict:
    print("=" * 60)
    print(f"[AGENT] Starting for user: {user_name!r} | message: {user_message!r}")

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY is not set in environment variables.")
    print(f"[AGENT] ✅ GOOGLE_API_KEY loaded (starts with: {api_key[:10]}...)")

    print("[AGENT] Building Gemini LLM...")
    llm = ChatGoogleGenerativeAI(
        model="gemini-3.8-flash",
        google_api_key=api_key,
        temperature=0.3,
    )
    print("[AGENT] ✅ LLM created")

    print(
        f"[AGENT] Building Gmail tools (refresh_token: {bool(refresh_token)}, access_token: {bool(access_token)})..."
    )
    tools = create_gmail_tools(
        refresh_token=refresh_token,
        access_token=access_token,
    )
    print(f"[AGENT] ✅ Tools: {[t.name for t in tools]}")

    print("[AGENT] Compiling LangGraph ReAct graph...")
    graph = create_react_agent(model=llm, tools=tools)
    print("[AGENT] ✅ Graph compiled")

    print("[AGENT] Invoking graph (calling Gemini API)...")
    try:
        final_state = graph.invoke(
            {
                "messages": [
                    SystemMessage(content=build_system_prompt(user_name)),
                    HumanMessage(content=user_message),
                ]
            }
        )
        print("[AGENT] ✅ Graph invocation complete")
    except Exception as e:
        print(f"[AGENT] ❌ Graph invocation FAILED: {type(e).__name__}: {e}")
        traceback.print_exc()
        raise

    # Extract which tools were called
    tools_used = []
    for msg in final_state["messages"]:
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            for tc in msg.tool_calls:
                tools_used.append(tc["name"])
                print(f"[AGENT] 🔧 Tool called: {tc['name']} | args: {tc['args']}")

    # Extract plain text reply
    # Gemini sometimes returns a list of content blocks instead of a plain string
    content = final_state["messages"][-1].content
    if isinstance(content, list):
        reply = " ".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in content
        )
    else:
        reply = str(content)

    print(f"[AGENT] ✅ Reply ({len(reply)} chars): {reply[:120]}...")
    print("=" * 60)

    return {"reply": reply, "tools_used": tools_used}
