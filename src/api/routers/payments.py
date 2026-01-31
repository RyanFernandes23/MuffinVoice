import logging
import os
from datetime import datetime, timezone

import razorpay
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session, or_, select

from src.api.deps import clerk_auth, get_current_user, get_session
from src.api.schema import SubscriptionEvent, UserSubscription
from src.utils.payment_client import razorpay_client

router = APIRouter(prefix="/payments", tags=["payments"])
logger = logging.getLogger(__name__)

RAZORPAY_WEBHOOK_SECRET = os.environ["RAZORPAY_WEBHOOK_SECRET"]
RAZORPAY_KEY_ID = os.environ["RAZORPAY_KEY_ID"]

# ------------------------------
# Models
# ------------------------------


class SubscribeRequest(BaseModel):
    plan_name: str  # "creator" or "professional"


class SubscribeResponse(BaseModel):
    subscription_id: str
    plan_id: str
    key_id: str
    customer_id: str


class VerifyPaymentRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_subscription_id: str
    razorpay_signature: str


class WebhookResponse(BaseModel):
    status: str
    message: str


# ------------------------------
# Helpers
# ------------------------------


def get_plan_id(plan_name: str) -> str:
    mapping = {
        "creator": os.environ["RAZORPAY_CREATOR_PLAN_ID"],
        "professional": os.environ["RAZORPAY_PROFESSIONAL_PLAN_ID"],
    }
    if plan_name not in mapping:
        raise HTTPException(status_code=400, detail="Invalid plan name")
    return mapping[plan_name]


# ------------------------------
# Subscription Creation
# ------------------------------


@router.post("/subscribe", response_model=SubscribeResponse)
async def create_subscription(
    req: SubscribeRequest,
    session: Session = Depends(get_session),
    token_payload=Depends(clerk_auth),
):

    try:
        plan_id = get_plan_id(req.plan_name)

        # Extract user info from token payload
        user_id = token_payload.decoded.get("sub")
        user_email = (
            token_payload.decoded.get("primary_email_address")
            or token_payload.decoded.get("email_address")
            or f"{user_id}@example.com"
        )
        # Check if customer exists
        existing_sub = session.exec(
            select(UserSubscription).where(UserSubscription.user_id == user_id)
        ).one_or_none()
        
        if existing_sub and existing_sub.status in ["active", "authenticated", "pending"]:
            raise HTTPException(status_code=400, detail="Subscription already active")

        customer_id = existing_sub.customer_id if existing_sub else None

        # Create Razorpay Customer
        if not customer_id:
            customer = razorpay_client.customer.create(
                {"name": user_id, "email": user_email}
            )
            customer_id = customer["id"]

        # Create Subscription
        subscription = razorpay_client.subscription.create(
            {
                "plan_id": plan_id,
                "customer_id": customer_id,
                "total_count": 12,
                "customer_notify": 1,
            }
        )

        # Save in DB
        if existing_sub:
            existing_sub.subscription_id = subscription["id"]
            existing_sub.plan_id = req.plan_name
            existing_sub.status = "created"
            existing_sub.updated_at = datetime.now(timezone.utc)
        else:
            session.add(
                UserSubscription(
                    user_id=user_id,
                    customer_id=customer_id,
                    subscription_id=subscription["id"],
                    plan_id=req.plan_name,
                    status="created",
                )
            )

        session.commit()

        return SubscribeResponse(
            subscription_id=subscription["id"],
            plan_id=plan_id,
            key_id=RAZORPAY_KEY_ID,
            customer_id=customer_id,
        )

    except Exception as e:
        logger.error(f"Subscription creation failed for {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Subscription creation failed")


# ------------------------------
# Payment Verification (First Mandate)
# ------------------------------


@router.post("/verify")
async def verify_payment(req: VerifyPaymentRequest):
    try:
        razorpay_client.utility.verify_payment_signature(
            {
                "razorpay_payment_id": req.razorpay_payment_id,
                "razorpay_subscription_id": req.razorpay_subscription_id,
                "razorpay_signature": req.razorpay_signature,
            }
        )
        return {"status": "success"}
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid signature")


# ------------------------------
# Webhook Receiver
# ------------------------------


@router.post("/webhook", response_model=WebhookResponse)
async def handle_webhook(request: Request, session: Session = Depends(get_session)):
    body_bytes = await request.body()
    signature = request.headers.get("X-Razorpay-Signature")

    try:
        razorpay_client.utility.verify_webhook_signature(
            body_bytes, signature, RAZORPAY_WEBHOOK_SECRET
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    event = await request.json()
    event_type = event.get("event")

    subscription_entity = event.get("payload", {}).get("subscription", {}).get("entity")
    if not subscription_entity:
        return WebhookResponse(status="ignored", message="Not a subscription event")

    subscription_id = subscription_entity["id"]

    user_sub = session.exec(
        select(UserSubscription).where(
            UserSubscription.subscription_id == subscription_id
        )
    ).one_or_none()

    if not user_sub:
        return WebhookResponse(status="ignored", message="Subscription not found")

    # Save raw event
    session.add(
        SubscriptionEvent(
            user_id=user_sub.user_id,
            subscription_id=subscription_id,
            event_type=event_type,
            event_data=event,
        )
    )

    # Lifecycle handling
    if event_type == "subscription.activated":
        user_sub.status = "active"
        user_sub.current_period_start = datetime.fromtimestamp(
            subscription_entity["current_start"], timezone.utc
        )
        user_sub.current_period_end = datetime.fromtimestamp(
            subscription_entity["current_end"], timezone.utc
        )

    elif event_type == "subscription.charged":
        user_sub.status = "active"
        user_sub.current_period_end = datetime.fromtimestamp(
            subscription_entity["current_end"], timezone.utc
        )
        user_sub.failed_payment_count = 0

    elif event_type == "subscription.halted":
        user_sub.status = "halted"

    elif event_type == "subscription.cancelled":
        user_sub.status = "cancelled"
        user_sub.current_period_end = datetime.fromtimestamp(
            subscription_entity["end_at"], timezone.utc
        )

    elif event_type == "subscription.authenticated":
        user_sub.status = "authenticated"

    elif event_type == "subscription.pending":
        user_sub.status = "pending"


    session.commit()
    return WebhookResponse(status="processed", message="OK")


# Cancel Subscription

@router.post("/cancel")
async def cancel_subscription(
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    user_sub = session.exec(
        select(UserSubscription).where(
            UserSubscription.user_id == user_id,
            or_(
                UserSubscription.status == "active",
                UserSubscription.status == "created",
            ),
        )
    ).one_or_none()

    if not user_sub:
        raise HTTPException(status_code=404, detail="No active subscription")

    razorpay_client.subscription.cancel(user_sub.subscription_id)
    return {"status": "ok", "message": "Cancellation requested"}
