from fastapi import Request
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.concurrency import iterate_in_threadpool
from pydantic import BaseModel
from sqlmodel import Session, select

from src.models.google_connection import GoogleConnection
from src.models.user import User
from src.agents.email_agent import stream_agent_run, stream_resume_agent_run


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------
class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []  # last N messages for short-term memory


class ResumeRequest(BaseModel):
    thread_id: str
    action: str  # "approve" or "cancel"


# ---------------------------------------------------------------------------
# Shared helper: authenticate + fetch user tokens from DB
# ---------------------------------------------------------------------------
async def _get_user_context(request: Request, session: Session):
    """
    Validates the session and returns (user_name, connection).
    Returns a JSONResponse error as the third value if anything is wrong.
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
# SSE streaming helpers
# ---------------------------------------------------------------------------
def _make_stream_response(sync_generator) -> StreamingResponse:
    """
    Wraps a synchronous generator (our LangGraph stream) into a proper
    async StreamingResponse for FastAPI.

    iterate_in_threadpool() runs each `next()` call in a threadpool so the
    sync LangGraph code doesn't block FastAPI's async event loop.
    """
    return StreamingResponse(
        iterate_in_threadpool(sync_generator),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disables nginx response buffering
        },
    )


# ---------------------------------------------------------------------------
# POST /agent/chat — start a new streaming agent run
# ---------------------------------------------------------------------------
async def agent_chat(
    request: Request, body: ChatRequest, session: Session
) -> StreamingResponse:
    print(f"[CONTROLLER] 📨 Chat: {body.message!r}")

    user_name, connection, err = await _get_user_context(request, session)
    if err:
        return err

    def generate():
        try:
            yield from stream_agent_run(
                user_message=body.message,
                refresh_token=connection.refresh_token,
                access_token=connection.access_token,
                user_name=user_name,
                history=body.history,
            )
        except Exception as e:
            import json, traceback

            traceback.print_exc()
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return _make_stream_response(generate())


# ---------------------------------------------------------------------------
# POST /agent/resume — approve or cancel a paused send_email action
# ---------------------------------------------------------------------------
async def agent_resume(
    request: Request, body: ResumeRequest, session: Session
) -> StreamingResponse:
    print(f"[CONTROLLER] ▶ Resume: thread_id={body.thread_id} action={body.action}")

    user_name, connection, err = await _get_user_context(request, session)
    if err:
        return err

    approved = body.action == "approve"

    def generate():
        try:
            yield from stream_resume_agent_run(
                thread_id=body.thread_id,
                approved=approved,
                refresh_token=connection.refresh_token,
                access_token=connection.access_token,
                user_name=user_name,
            )
        except Exception as e:
            import json, traceback

            traceback.print_exc()
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return _make_stream_response(generate())
