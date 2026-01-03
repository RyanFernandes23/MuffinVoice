from sqlmodel import SQLModel, Field, Session, create_engine, select
from typing import Optional, List
from datetime import datetime, timezone
import uuid


class Notebook(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)  # The Clerk User ID
    job_id: str = Field(unique=True, index=True)
    title: str
    voice: str
    created_at: datetime = Field(default_factory=datetime.now(timezone.utc))
    status: str = Field(default="processing")


class Note(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(index=True)
    job_id: str = Field(index=True)
    timestamp: float  # Audio timestamp in seconds
    user_note: str  # The note text
    subtitle_text: Optional[str] = None  # Context: subtitle text at that moment
    created_at: datetime = Field(default_factory=datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return f"<Note user_id={self.user_id} job_id={self.job_id} timestamp={self.timestamp}>"


class UserSubscription(SQLModel, table=True):
    user_id: str = Field(primary_key=True)  # Links to Clerk ID

    # Lemon Squeezy Identifiers
    customer_id: str = Field(index=True)  # Used for API calls (portal, etc)
    subscription_id: str = Field(index=True)  # Used to update/cancel
    variant_id: str = Field(
        index=True
    )  # Which plan are they on? (explorer(free), creator, professional)

    # Status Tracking
    status: str  # active, past_due, cancelled, expired, etc.
    current_period_end: Optional[datetime] = Field(
        nullable=True
    )  # When does access actully end?

    updated_at: datetime = Field(default_factory=datetime.now(timezone.utc))
