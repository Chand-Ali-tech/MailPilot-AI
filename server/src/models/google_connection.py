from datetime import datetime, timezone

from sqlmodel import SQLModel, Field


class GoogleConnection(SQLModel, table=True):
    __tablename__ = "google_connections"

    id: int | None = Field(default=None, primary_key=True)

    user_id: int = Field(foreign_key="users.id", index=True)

    google_email: str = Field(index=True, unique=True)

    refresh_token: str
    access_token: str | None = None

    scopes: str | None = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
