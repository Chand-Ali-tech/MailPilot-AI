import os
from datetime import datetime, timezone
import httpx
from fastapi import Depends, HTTPException, Request
from starlette.responses import RedirectResponse
from sqlmodel import Session, select

from src.config.database import get_session
from src.config.oauth_config import oauth
from src.models.user import User
from src.models.google_connection import GoogleConnection

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


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

    # Store user_id in session cookie
    request.session["user_id"] = user.id

    # Redirect user back to frontend
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    return RedirectResponse(url=frontend_url)


async def get_current_user(
    request: Request,
    session: Session = Depends(get_session),
):
    """Returns the currently authenticated user if a valid session exists."""
    user_id = request.session.get("user_id")

    if not user_id:
        return {"user": None}

    user = session.get(User, user_id)
    if not user:
        request.session.clear()
        return {"user": None}

    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
        }
    }


async def logout(request: Request):
    """Clears the session cookie."""
    request.session.clear()
    return {"message": "Logged out successfully"}


async def refresh_google_access_token(
    connection: GoogleConnection,
    session: Session,
) -> str:
    """
    Uses the stored refresh_token to fetch a new access_token from Google OAuth2.
    Updates the database with the new access_token and returns it.
    """
    if not connection.refresh_token:
        raise HTTPException(
            status_code=400,
            detail="No refresh token available. User must re-authenticate with Google.",
        )

    payload = {
        "client_id": os.getenv("GOOGLE_CLIENT_ID"),
        "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
        "refresh_token": connection.refresh_token,
        "grant_type": "refresh_token",
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(GOOGLE_TOKEN_URL, data=payload)

    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Failed to refresh Google token: {response.text}",
        )

    token_data = response.json()
    new_access_token = token_data.get("access_token")

    if not new_access_token:
        raise HTTPException(
            status_code=400,
            detail="Google token response did not contain an access_token",
        )

    # Update access token in database
    connection.access_token = new_access_token
    connection.updated_at = datetime.now(timezone.utc)

    # Google may optionally rotate the refresh token
    if "refresh_token" in token_data:
        connection.refresh_token = token_data["refresh_token"]

    session.add(connection)
    session.commit()
    session.refresh(connection)

    print(f"Successfully refreshed Google access token for user {connection.user_id}")
    return new_access_token


async def get_user_google_token(
    user_id: int,
    session: Session,
) -> str:
    """
    Returns a valid access token for the given user_id.
    If no access token exists, it requests a new one using the refresh token.
    """
    connection = session.exec(
        select(GoogleConnection).where(GoogleConnection.user_id == user_id)
    ).first()

    if not connection:
        raise HTTPException(
            status_code=404,
            detail="Google connection not found for this user.",
        )

    if not connection.access_token:
        return await refresh_google_access_token(connection, session)

    return connection.access_token


async def refresh_user_token(
    request: Request,
    session: Session = Depends(get_session),
):
    """API endpoint to manually trigger a token refresh for the current logged in user."""
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    connection = session.exec(
        select(GoogleConnection).where(GoogleConnection.user_id == user_id)
    ).first()

    if not connection:
        raise HTTPException(
            status_code=404,
            detail="Google account connection not found for current user.",
        )

    new_token = await refresh_google_access_token(connection, session)

    return {
        "message": "Token refreshed successfully",
        "updated_at": connection.updated_at.isoformat(),
    }
