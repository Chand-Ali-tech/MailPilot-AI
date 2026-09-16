import uvicorn
from fastapi import Request

from src.utils.get_app import get_app
from src.controllers.auth_controller import google_login, google_callback

app = get_app()


@app.get("/auth/google")
async def login(request: Request):
    return await google_login(request)


@app.get("/auth/google/callback")
async def callback(request: Request):
    return await google_callback(request)


def main():
    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    main()
