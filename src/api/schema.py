import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import JSON
from sqlmodel import Field, Session, SQLModel, create_engine, select


class Notebook(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)  # The Clerk User ID
    job_id: str = Field(unique=True, index=True)
    title: str
    voice: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = Field(default="processing")


class Note(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(index=True)
    job_id: str = Field(index=True)
    timestamp: float  # Audio timestamp in seconds
    user_note: str  # The note text
    subtitle_text: Optional[str] = None  # Context: subtitle text at that moment
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return f"<Note user_id={self.user_id} job_id={self.job_id} timestamp={self.timestamp}>"
