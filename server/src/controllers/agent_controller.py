from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from src.models.google_connection import GoogleConnection
from src.models.user import User
from src.agents.email_agent import start_agent_run, resume_agent_run


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------
class ChatRequest(BaseModel):
    message: str


class ResumeRequest(BaseModel):
    thread_id: str
    action: str  # "approve" or "cancel"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
async def _get_user_context(request: Request, session: Session):
    """
    Returns (user_name, connection) for the current session user,
    or a JSONResponse error if something is wrong.
    """
    user_id = request.session.get("user_id")
    if not user_id:
        return None, None, JSONResponse({"error": "Not authenticated"}, status_code=401)

    connection = session.exec(
        select(GoogleConnection).where(GoogleConnection.user_id == user_id)
    ).first()

    if not connection:
        return (
            None,
            None,
            JSONResponse(
                {"error": "Google account not connected. Please reconnect."},
                status_code=403,
            ),
        )

    if not connection.refresh_token:
        return (
            None,
            None,
            JSONResponse(
                {
                    "error": "No refresh token found. Please re-authenticate with Google."
                },
                status_code=403,
            ),
        )

    user = session.exec(select(User).where(User.id == user_id)).first()
    user_name = user.name if user and user.name else "the user"

    return user_name, connection, None


# ---------------------------------------------------------------------------
# POST /agent/chat — start a new agent run
# ---------------------------------------------------------------------------
async def agent_chat(
    request: Request, body: ChatRequest, session: Session
) -> JSONResponse:
    print(f"[CONTROLLER] 📨 Chat request: {body.message!r}")

    user_name, connection, err = await _get_user_context(request, session)
    if err:
        return err

    try:
        result = start_agent_run(
            user_message=body.message,
            refresh_token=connection.refresh_token,
            access_token=connection.access_token,
            user_name=user_name,
        )
        return JSONResponse(result)

    except ValueError as e:
        print(f"[CONTROLLER] ❌ ValueError: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

    except Exception as e:
        import traceback

        print(f"[CONTROLLER] ❌ {type(e).__name__}: {e}")
        traceback.print_exc()
        return JSONResponse({"error": f"{type(e).__name__}: {str(e)}"}, status_code=500)


# ---------------------------------------------------------------------------
# POST /agent/resume — approve or cancel a paused send_email action
# ---------------------------------------------------------------------------
async def agent_resume(
    request: Request, body: ResumeRequest, session: Session
) -> JSONResponse:
    print(
        f"[CONTROLLER] ▶  Resume request: thread_id={body.thread_id} action={body.action}"
    )

    user_name, connection, err = await _get_user_context(request, session)
    if err:
        return err

    approved = body.action == "approve"

    try:
        result = resume_agent_run(
            thread_id=body.thread_id,
            approved=approved,
            refresh_token=connection.refresh_token,
            access_token=connection.access_token,
            user_name=user_name,
        )
        return JSONResponse(result)

    except ValueError as e:
        print(f"[CONTROLLER] ❌ ValueError: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

    except Exception as e:
        import traceback

        print(f"[CONTROLLER] ❌ {type(e).__name__}: {e}")
        traceback.print_exc()
        return JSONResponse({"error": f"{type(e).__name__}: {str(e)}"}, status_code=500)
