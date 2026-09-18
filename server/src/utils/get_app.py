import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

load_dotenv()


def get_app() -> FastAPI:
    app = FastAPI(title="Email Agent API")

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

    # Add CORS middleware to allow credentials (cookies) from frontend
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[frontend_url, "http://localhost:3000", "http://127.0.0.1:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Session middleware for auth state and OAuth handling
    app.add_middleware(
        SessionMiddleware,
        secret_key=os.getenv("SESSION_SECRET"),
        same_site="lax",
        https_only=False,
    )

    return app
