import os
from fastapi import Request
from src.config.oauth_config import oauth


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


async def google_callback(request: Request):
    print("Handling Google callback...")
    print("Request query parameters:", request.query_params)
    token = await oauth.google.authorize_access_token(request)

    print("Received token from Google:", token)

    user_info = token.get("userinfo")

    return {
        "user": user_info,
        "token": token,
    }
