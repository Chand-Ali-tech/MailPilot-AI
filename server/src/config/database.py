import os
from dotenv import load_dotenv
from sqlmodel import SQLModel, Session, create_engine

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@localhost:5432/postgres",
)

if DATABASE_URL:
    DATABASE_URL = DATABASE_URL.strip().strip("'\"")
    if DATABASE_URL.startswith("DATABASE_URL="):
        DATABASE_URL = DATABASE_URL.split("DATABASE_URL=", 1)[1].strip()

# Convert postgresql:// to postgresql+psycopg:// for psycopg v3 compatibility
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

engine = create_engine(
    DATABASE_URL,
    echo=True,
)


def create_db_and_tables():
    from src.models import User, GoogleConnection  # noqa: F401 - ensure models are imported

    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
