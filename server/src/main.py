import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from starlette.middleware.sessions import SessionMiddleware
from authlib.integrations.starlette_client import OAuth

load_dotenv()

app = FastAPI()

app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET"),
)

oauth = OAuth()

oauth.register(
    name="google",
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={
        "scope": ("openid email profile https://www.googleapis.com/auth/gmail.readonly")
    },
)


@app.get("/auth/google")
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


@app.get("/auth/google/callback")
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
