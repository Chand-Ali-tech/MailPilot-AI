from datetime import datetime, timezone

from sqlmodel import SQLModel, Field


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)

    email: str = Field(index=True, unique=True)

    name: str | None = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
