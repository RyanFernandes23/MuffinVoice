import uuid
from datetime import date, datetime, timezone
from typing import Dict, List, Optional
from decimal import Decimal

from sqlalchemy import Column, JSON, ForeignKey, Index
from sqlmodel import Field, Session, SQLModel, create_engine, select, Relationship


class NotebookBase(SQLModel):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(index=True, foreign_key="user.user_id")
    job_id: str = Field(unique=True, index=True)
    title: str
    voice: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = Field(default="processing")
    tokens_used: int = Field(default=0)
    tokens_requested: int = Field(default=0)
    source_url: Optional[str] = Field(
        default=None, max_length=2048
    )  # Store webpage source URL
    is_public: bool = Field(default=False)


class Notebook(NotebookBase, table=True):
    user: Optional["User"] = Relationship(back_populates="notebooks")
    notes: List["Note"] = Relationship(back_populates="notebook", cascade_delete=True)


class NotebookRead(NotebookBase):
    """Schema for API responses including real-time progress"""
    progress_percent: int = 0


class Note(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(index=True, foreign_key="user.user_id")
    job_id: str = Field(
        sa_column=Column(ForeignKey("notebook.job_id", ondelete="CASCADE"), index=True)
    )
    timestamp: float
    user_note: str
    subtitle_text: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return f"<Note user_id={self.user_id} job_id={self.job_id} timestamp={self.timestamp}>"

    user: Optional["User"] = Relationship(back_populates="notes")
    notebook: Optional["Notebook"] = Relationship(back_populates="notes")


class User(SQLModel, table=True):
    user_id: str = Field(primary_key=True, max_length=255)
    username: str = Field(unique=True, max_length=255, index=True)
    email: str = Field(unique=True, max_length=255, index=True)
    password_hash: Optional[str] = Field(default=None, max_length=255)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    tokens_remaining: int = Field(default=0)
    tokens_allocated: int = Field(default=0)
    monthly_tokens_used: int = Field(default=0)
    last_reset_date: Optional[datetime] = Field(default=None)
    deleted_at: Optional[datetime] = Field(default=None)

    notebooks: List["Notebook"] = Relationship(back_populates="user")
    notes: List["Note"] = Relationship(back_populates="user")
    payments: List["Payment"] = Relationship(back_populates="user")
    subscriptions: List["Subscription"] = Relationship(back_populates="user")
    payment_events: List["PaymentEvent"] = Relationship(back_populates="user")
    customer: Optional["Customer"] = Relationship(back_populates="user")
    token_usage_logs: List["TokenUsageLog"] = Relationship(back_populates="user")


class Customer(SQLModel, table=True):
    customer_id: Optional[str] = Field(default=None, max_length=255)
    user_id: str = Field(primary_key=True, max_length=255, foreign_key="user.user_id")
    razorpay_customer_id: str = Field(max_length=255, unique=True, index=True)
    email: str = Field(max_length=255)
    contact: Optional[str] = Field(default=None, max_length=20)
    name: Optional[str] = Field(default=None, max_length=255)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    user: User = Relationship(back_populates="customer")


class Plan(SQLModel, table=True):
    plan_id: str = Field(primary_key=True, max_length=255)
    razorpay_plan_id: Optional[str] = Field(
        default=None, max_length=255, index=True
    )  # Removed unique=True for test mode
    name: str = Field(max_length=255)
    description: Optional[str] = Field(default=None)
    price: Decimal = Field(max_digits=10, decimal_places=2)
    currency: str = Field(max_length=3)
    
    __table_args__ = (
        Index("ix_plan_name_currency", "name", "currency", unique=True),
    )
    duration_days: int
    is_active: bool = Field(default=True)
    token_limit: int = Field(default=40000)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Relationships
    payments: List["Payment"] = Relationship(back_populates="plan")
    subscriptions: List["Subscription"] = Relationship(back_populates="plan")


class Payment(SQLModel, table=True):
    payment_id: str = Field(
        default_factory=lambda: f"pay_{uuid.uuid4().hex}",
        primary_key=True,
        max_length=255,
    )
    user_id: str = Field(foreign_key="user.user_id", index=True)
    plan_id: Optional[str] = Field(default=None, foreign_key="plan.plan_id", index=True)

    amount: Decimal = Field(max_digits=10, decimal_places=2)
    currency: str = Field(max_length=3)
    status: str = Field(max_length=50)

    gateway_payment_id: Optional[str] = Field(default=None, max_length=255)
    gateway_order_id: Optional[str] = Field(default=None, max_length=255)
    gateway_signature: Optional[str] = Field(default=None, max_length=512)
    gateway_response_code: Optional[str] = Field(default=None, max_length=100)
    gateway_response_message: Optional[str] = Field(default=None)
    payment_method: Optional[str] = Field(default=None, max_length=50)

    transaction_timestamp: datetime = Field()
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Relationships
    user: User = Relationship(back_populates="payments")
    plan: Optional[Plan] = Relationship(back_populates="payments")
    payment_events: List["PaymentEvent"] = Relationship(back_populates="payment")
    subscription: Optional["Subscription"] = Relationship(back_populates="payment")


class Subscription(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    razorpay_subscription_id: str = Field(max_length=255, unique=True, index=True)
    user_id: str = Field(foreign_key="user.user_id", index=True)
    plan_id: str = Field(foreign_key="plan.plan_id", index=True)
    payment_id: Optional[str] = Field(
        default=None, foreign_key="payment.payment_id", index=True
    )

    start_date: date = Field()
    end_date: date = Field()
    status: str = Field(max_length=50)
    auto_renew_enabled: bool = Field(default=False)
    cancelled_at: Optional[datetime] = Field(default=None)
    cancel_reason: Optional[str] = Field(default=None)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Relationships
    user: User = Relationship(back_populates="subscriptions")
    plan: Plan = Relationship(back_populates="subscriptions")
    payment: Optional[Payment] = Relationship(back_populates="subscription")
    payment_events: List["PaymentEvent"] = Relationship(back_populates="subscription")


class PaymentEvent(SQLModel, table=True):
    event_id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: str = Field(foreign_key="user.user_id", index=True)
    payment_id: Optional[str] = Field(
        default=None, foreign_key="payment.payment_id", index=True
    )
    subscription_id: Optional[str] = Field(
        default=None, foreign_key="subscription.razorpay_subscription_id", index=True
    )

    event_type: str = Field(max_length=100)
    event_description: Optional[str] = Field(default=None)
    error_code: Optional[str] = Field(default=None, max_length=100)
    error_details: Optional[Dict] = Field(default=None, sa_column=Column(JSON))

    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_resolved: bool = Field(default=False)
    resolved_at: Optional[datetime] = Field(default=None)
    resolved_by: Optional[str] = Field(default=None, max_length=255)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Relationships
    user: User = Relationship(back_populates="payment_events")
    payment: Optional[Payment] = Relationship(back_populates="payment_events")
    subscription: Optional[Subscription] = Relationship(back_populates="payment_events")


class TokenUsageLog(SQLModel, table=True):
    log_id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="user.user_id", index=True)
    notebook_id: Optional[str] = Field(default=None)
    action: str = Field(max_length=50)
    amount: int
    balance_before: int
    balance_after: int
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    user: User = Relationship(back_populates="token_usage_logs")


class DeletedUser(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(max_length=255, index=True)
    deleted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    previous_plan: str = Field(max_length=50)
    tokens_remaining_at_deletion: int = Field(default=0)
    razorpay_subscription_id: Optional[str] = Field(default=None, max_length=255)
