from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from src.models.google_connection import GoogleConnection
from src.models.user import User
from src.agents.email_agent import run_email_agent


class ChatRequest(BaseModel):
    message: str


async def agent_chat(
    request: Request, body: ChatRequest, session: Session
) -> JSONResponse:
    """
    POST /agent/chat
    Runs the email agent with the authenticated user's message.
    """

    print(f"😁😁😁 Received chat request: {body.message}")

    user_id = request.session.get("user_id")
    if not user_id:
        return JSONResponse({"error": "Not authenticated"}, status_code=401)

    # Fetch user's Google connection (tokens)
    connection = session.exec(
        select(GoogleConnection).where(GoogleConnection.user_id == user_id)
    ).first()

    if not connection:
        return JSONResponse(
            {"error": "Google account not connected. Please reconnect."},
            status_code=403,
        )

    if not connection.refresh_token:
        return JSONResponse(
            {"error": "No refresh token found. Please re-authenticate with Google."},
            status_code=403,
        )

    # Fetch user's name for the system prompt
    user = session.exec(select(User).where(User.id == user_id)).first()
    user_name = user.name if user and user.name else "the user"

    try:
        result = run_email_agent(
            user_message=body.message,
            refresh_token=connection.refresh_token,
            access_token=connection.access_token,
            user_name=user_name,
        )
        return JSONResponse(
            {"reply": result["reply"], "tools_used": result["tools_used"]}
        )

    except ValueError as e:
        print(f"[CONTROLLER] ❌ ValueError: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

    except Exception as e:
        import traceback

        print(f"[CONTROLLER] ❌ Unexpected error: {type(e).__name__}: {e}")
        traceback.print_exc()
        return JSONResponse(
            {"error": f"{type(e).__name__}: {str(e)}"},
            status_code=500,
        )
