import uvicorn
from fastapi import Depends, Request
from sqlmodel import Session

from src.utils.get_app import get_app
from src.controllers.auth_controller import (
    google_login,
    google_callback,
    get_current_user,
    logout,
    refresh_user_token,
)
from src.controllers.email_controller import get_latest_emails, get_email_details
from src.controllers.agent_controller import ChatRequest, agent_chat
from src.config.database import create_db_and_tables, get_session

app = get_app()


@app.on_event("startup")
def startup():
    try:
        create_db_and_tables()
    except Exception as e:
        print(f"Warning: Could not connect to database on startup: {e}")


# Auth Routes
@app.get("/auth/google")
async def login(request: Request):
    return await google_login(request)


@app.get("/auth/google/callback")
async def callback(request: Request, session: Session = Depends(get_session)):
    return await google_callback(request, session)


@app.get("/auth/me")
async def me(request: Request, session: Session = Depends(get_session)):
    return await get_current_user(request, session)


@app.post("/auth/logout")
@app.get("/auth/logout")
async def handle_logout(request: Request):
    return await logout(request)


@app.post("/auth/refresh")
async def handle_refresh(request: Request, session: Session = Depends(get_session)):
    return await refresh_user_token(request, session)


# Email Routes
@app.get("/api/emails/latest")
@app.get("/emails/latest")
async def latest_emails(
    request: Request,
    limit: int = 5,
    session: Session = Depends(get_session),
):
    return await get_latest_emails(request, limit=limit, session=session)


@app.get("/api/emails/{message_id}")
@app.get("/emails/{message_id}")
async def email_details(
    message_id: str,
    request: Request,
    session: Session = Depends(get_session),
):
    return await get_email_details(message_id, request, session=session)


# Agent Route
@app.post("/agent/chat")
async def chat(request: Request, body: ChatRequest, session: Session = Depends(get_session)):
    return await agent_chat(request, body, session)


def main():
    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    main()
