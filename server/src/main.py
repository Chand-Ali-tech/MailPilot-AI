import uvicorn
from fastapi import Depends, Request
from sqlmodel import Session

from src.utils.get_app import get_app
from src.controllers.auth_controller import google_login, google_callback
from src.config.database import create_db_and_tables, get_session

app = get_app()


@app.on_event("startup")
def startup():
    try:
        create_db_and_tables()
    except Exception as e:
        print(f"Warning: Could not connect to database on startup: {e}")


@app.get("/auth/google")
async def login(request: Request):
    return await google_login(request)


@app.get("/auth/google/callback")
async def callback(request: Request, session: Session = Depends(get_session)):
    return await google_callback(request, session)


def main():
    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    main()
