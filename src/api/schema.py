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


class UserSubscription(SQLModel, table=True):
    user_id: str = Field(primary_key=True)  # Links to Clerk ID

    # Razorpay Identifiers
    customer_id: Optional[str] = Field(default=None, index=True)
    subscription_id: Optional[str] = Field(default=None, index=True)
    plan_id: str = Field(
        index=True, default="explorer"
    )  # explorer, creator, professional

    # Status Tracking
    status: str = Field(default="active") 
    current_period_start: Optional[datetime] = Field(default=None)
    current_period_end: Optional[datetime] = Field(
        default=None
    )  # When does access actually end?

    # Usage Tracking
    monthly_char_used: int = Field(default=0)
    last_usage_reset_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Payment Retry
    retry_payment_link_id: Optional[str] = Field(default=None)
    failed_payment_count: int = Field(default=0)


class SubscriptionEvent(SQLModel, table=True):
    id: int = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)
    subscription_id: str = Field(default=None, index=True)
    event_type: str = Field(
        default="unknown"
    )  # created, upgraded, failed, expired, etc.
    event_data: dict = Field(sa_type=JSON)  # Full event payload
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
