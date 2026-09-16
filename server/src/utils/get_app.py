import os
from dotenv import load_dotenv
from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware

load_dotenv()


def get_app() -> FastAPI:
    app = FastAPI()

    app.add_middleware(
        SessionMiddleware,
        secret_key=os.getenv("SESSION_SECRET", "default_secret_key"),
    )

    return app
