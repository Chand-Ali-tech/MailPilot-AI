import os
from dotenv import load_dotenv
from sqlmodel import SQLModel, Session, create_engine

load_dotenv()

# Read the database URL from environment variables.
# Falls back to a local default if not set.
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@localhost:5432/postgres",
)

# Strip any accidental quotes or whitespace that might come from .env files
if DATABASE_URL:
    DATABASE_URL = DATABASE_URL.strip().strip("'\"")
    # Guard against a malformed .env where the value starts with "DATABASE_URL="
    if DATABASE_URL.startswith("DATABASE_URL="):
        DATABASE_URL = DATABASE_URL.split("DATABASE_URL=", 1)[1].strip()

# Convert postgresql:// to postgresql+psycopg:// for psycopg v3 compatibility
# psycopg v3 requires the postgresql+psycopg:// prefix.
# If someone sets a plain postgresql:// URL, fix it automatically.
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

engine = create_engine(
    DATABASE_URL,
    echo=True,
)
engine = create_engine(DATABASE_URL)


def create_db_and_tables():
    from src.models import User, GoogleConnection  # noqa: F401 - ensure models are imported
    """Creates all database tables based on the SQLModel definitions."""
    from src.models import User, GoogleConnection  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session():
    """FastAPI dependency that yields a database session per request."""
    with Session(engine) as session:
        yield session
