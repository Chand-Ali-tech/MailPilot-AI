import os
from datetime import datetime, timezone
from fastapi import Depends, HTTPException, Request
from sqlmodel import Session, select

from src.config.database import get_session
from src.config.oauth_config import oauth
from src.models.user import User
from src.models.google_connection import GoogleConnection


async def google_login(request: Request):
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI")

    result = await oauth.google.authorize_redirect(
        request,
        redirect_uri,
        access_type="offline",
        prompt="consent",
    )

    print("Redirecting to Google for authentication...", result)

    return result


async def google_callback(
    request: Request,
    session: Session = Depends(get_session),
):
    token = await oauth.google.authorize_access_token(request)

    user_info = token.get("userinfo")

    if not user_info:
        raise HTTPException(
            status_code=400,
            detail="Could not get Google user information",
        )

    email = user_info["email"]
    name = user_info.get("name")

    # ------------------------
    # Find or create user
    # ------------------------

    user = session.exec(select(User).where(User.email == email)).first()

    if not user:
        user = User(
            email=email,
            name=name,
        )

        session.add(user)
        session.commit()
        session.refresh(user)

    # ------------------------
    # Find Google connection
    # ------------------------

    connection = session.exec(
        select(GoogleConnection).where(GoogleConnection.user_id == user.id)
    ).first()

    refresh_token = token.get("refresh_token")
    access_token = token.get("access_token")
    scopes = token.get("scope")

    if not connection:
        if not refresh_token:
            raise HTTPException(
                status_code=400,
                detail="Google did not return a refresh token",
            )

        connection = GoogleConnection(
            user_id=user.id,
            google_email=email,
            refresh_token=refresh_token,
            access_token=access_token,
            scopes=scopes,
        )

        session.add(connection)

    else:
        # Google does not always return refresh_token
        # after the first authorization.
        if refresh_token:
            connection.refresh_token = refresh_token

        if access_token:
            connection.access_token = access_token

        connection.scopes = scopes
        connection.updated_at = datetime.now(timezone.utc)

        session.add(connection)

    session.commit()

    return {
        "message": "Google account connected successfully",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
        },
    }
