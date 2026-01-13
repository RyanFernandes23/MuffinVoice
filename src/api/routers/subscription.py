# src/api/routers/subscription.py

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from sqlmodel import Session, select
from datetime import datetime, timezone
import hmac
import hashlib

from src.api.utils import get_session, engine
from src.api.schema import UserSubscription, SubscriptionEvent
from src.api.deps import (
    clerk_auth,
    logger,
    razorpay_client,
    RAZORPAY_KEY_ID,
    RAZORPAY_WEBHOOK_SECRET,
    RAZORPAY_CREATOR_PLAN_ID,
    RAZORPAY_PROFESSIONAL_PLAN_ID,
)

subscription_router = APIRouter(
    prefix="/api/subscription",
    tags=["subscription"]
)

# ------------------------------------------------------------------
# CONSTANTS
# ------------------------------------------------------------------

PLAN_IDS = {
    "creator": RAZORPAY_CREATOR_PLAN_ID,
    "professional": RAZORPAY_PROFESSIONAL_PLAN_ID,
}

PLAN_NAMES = {
    "explorer": "Explorer",
    "creator": "Creator",
    "professional": "Professional",
}

PLAN_ORDER = {
    "explorer": 0,
    "creator": 1,
    "professional": 2,
}

ALLOWED_WEBHOOK_EVENTS = {
    "subscription.activated",
    "subscription.charged",
    "subscription.completed",
    "subscription.halted",
    "subscription.cancelled",
}

# ------------------------------------------------------------------
# SCHEMAS
# ------------------------------------------------------------------

class CheckoutRequest(BaseModel):
    plan_id: str  # creator | professional

class VerificationRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_subscription_id: str
    razorpay_signature: str

# ------------------------------------------------------------------
# HELPERS
# ------------------------------------------------------------------

def can_upgrade(current: str, target: str) -> bool:
    return PLAN_ORDER.get(current, 0) < PLAN_ORDER.get(target, 0)

def ts_to_dt(ts: int | None):
    if not ts:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc)

def cancel_subscription_safely(subscription_id: str):
    """
    Cancel subscription without throwing error if already cancelled
    """
    if not subscription_id:
        return
    try:
        # Check status first or just attempt cancel
        razorpay_client.subscription.cancel(
            subscription_id,
            {"cancel_at_cycle_end": False}
        )
        logger.info(f"Successfully cancelled old subscription: {subscription_id}")
    except Exception as e:
        logger.warning(f"Attempted to cancel {subscription_id} but failed (might be already cancelled): {e}")

def create_new_subscription(
    *,
    user_id: str,
    plan_id: str,
    customer_id: str | None,
    prev_sub_id: str | None = None
):
    """
    Create a fresh Razorpay subscription.
    """
    notes = {
        "user_id": user_id,
        "plan_id": plan_id,
    }
    
    # Store previous sub ID in notes so webhook knows what to cancel
    # when this new one activates
    if prev_sub_id:
        notes["previous_subscription_id"] = prev_sub_id

    payload = {
        "plan_id": PLAN_IDS[plan_id],
        "total_count": 120,  # infinite subscription
        "customer_notify": 1,
        "notes": notes,
    }

    if customer_id:
        payload["customer_id"] = customer_id

    try:
        sub = razorpay_client.subscription.create(payload)
        return {
            "subscription_id": sub["id"],
            "razorpay_key_id": RAZORPAY_KEY_ID,
        }
    except Exception as e:
        logger.error(f"Razorpay subscription creation failed: {e}")
        raise HTTPException(status_code=500, detail="Subscription creation failed")

# ------------------------------------------------------------------
# CHECKOUT (NEW + UPGRADE)
# ------------------------------------------------------------------

@subscription_router.post("/checkout")
async def checkout(
    request: CheckoutRequest,
    token_payload=Depends(clerk_auth),
    session: Session = Depends(get_session),
):
    user_id = token_payload.decoded.get("sub")
    plan_id = request.plan_id

    if plan_id not in PLAN_IDS:
        raise HTTPException(status_code=400, detail="Invalid plan_id")

    sub = session.get(UserSubscription, user_id)

    # --------------------------------------------------------------
    # UPGRADE FLOW
    # --------------------------------------------------------------
    if sub and sub.plan_id != "explorer" and sub.status == "active":
        if sub.plan_id == plan_id:
            raise HTTPException(
                status_code=400,
                detail=f"Already on {PLAN_NAMES[plan_id]} plan",
            )

        if not can_upgrade(sub.plan_id, plan_id):
            raise HTTPException(
                status_code=400,
                detail="Downgrades are not supported",
            )
            
        # SAFETY FIX: Do NOT cancel existing subscription here. 
        # Only cancel it once the new one is confirmed active via webhook/verify.
        # We pass the old ID to the new subscription notes.
        return create_new_subscription(
            user_id=user_id,
            plan_id=plan_id,
            customer_id=sub.customer_id,
            prev_sub_id=sub.subscription_id 
        )

    # --------------------------------------------------------------
    # NEW SUBSCRIPTION FLOW
    # --------------------------------------------------------------
    customer_id = sub.customer_id if sub else None

    return create_new_subscription(
        user_id=user_id,
        plan_id=plan_id,
        customer_id=customer_id,
    )

# ------------------------------------------------------------------
# VERIFY (NEW ENDPOINT)
# ------------------------------------------------------------------

@subscription_router.post("/verify")
async def verify_payment(
    request: VerificationRequest,
    token_payload=Depends(clerk_auth),
    session: Session = Depends(get_session),
):
    """
    Verifies the payment signature generated by Razorpay.
    This acts as an immediate confirmation for the frontend before the webhook arrives.
    """
    user_id = token_payload.decoded.get("sub")
    
    # 1. Verify Signature
    try:
        data = f"{request.razorpay_payment_id}|{request.razorpay_subscription_id}"
        generated_signature = hmac.new(
            RAZORPAY_WEBHOOK_SECRET.encode(), # Or Key Secret? For checkout it's Key Secret usually
            data.encode(), 
            hashlib.sha256
        ).hexdigest()
        
        # Razorpay client utility is safer
        razorpay_client.utility.verify_payment_signature({
            'razorpay_payment_id': request.razorpay_payment_id,
            'razorpay_subscription_id': request.razorpay_subscription_id,
            'razorpay_signature': request.razorpay_signature
        })
    except Exception as e:
        logger.error(f"Signature verification failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    # 2. Update Database (Optimistic Update)
    # The webhook will eventually reconcile this, but we update now for UX speed
    sub = session.get(UserSubscription, user_id)
    if not sub:
        sub = UserSubscription(user_id=user_id)
        
    # Check if we need to cancel an OLD subscription that is different from this new one
    if sub.subscription_id and sub.subscription_id != request.razorpay_subscription_id:
        cancel_subscription_safely(sub.subscription_id)

    # Fetch fresh details from Razorpay to get accurate plan/dates
    try:
        rzp_sub = razorpay_client.subscription.fetch(request.razorpay_subscription_id)
        
        # Update local DB
        sub.subscription_id = rzp_sub['id']
        sub.customer_id = rzp_sub.get('customer_id')
        sub.status = rzp_sub['status']
        sub.plan_id = rzp_sub['notes'].get('plan_id', 'creator') # Fallback if notes missing
        sub.current_period_start = ts_to_dt(rzp_sub.get('current_start'))
        sub.current_period_end = ts_to_dt(rzp_sub.get('current_end'))
        sub.monthly_char_used = 0 # Reset usage on new sub
        
        session.add(sub)
        session.commit()
        
        return {"success": True, "status": sub.status}
        
    except Exception as e:
        logger.error(f"Failed to fetch subscription details: {e}")
        # Even if fetch fails, signature was valid, so return success
        return {"success": True, "warning": "Signature valid but sync failed"}

# ------------------------------------------------------------------
# WEBHOOK
# ------------------------------------------------------------------

@subscription_router.post("/webhook")
async def razorpay_webhook(request: Request):
    raw_body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature")

    try:
        razorpay_client.utility.verify_webhook_signature(
            raw_body.decode(),
            signature,
            RAZORPAY_WEBHOOK_SECRET,
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid signature")

    payload = await request.json()
    event_type = payload.get("event")

    if event_type not in ALLOWED_WEBHOOK_EVENTS:
        return {"status": "ignored"}

    entity = payload.get("payload", {}).get("subscription", {}).get("entity", {})
    notes = entity.get("notes", {})

    user_id = notes.get("user_id")
    plan_id = notes.get("plan_id")
    prev_sub_id = notes.get("previous_subscription_id")

    if not user_id:
        logger.error(f"Webhook ignored: missing user_id")
        return {"status": "ignored"}

    with Session(engine) as session:
        sub = session.get(UserSubscription, user_id)
        if not sub:
            sub = UserSubscription(user_id=user_id)

        # ----------------------------------------------------------
        # SAFETY FIX: Handle Upgrade Cleanups
        # ----------------------------------------------------------
        # If this event is "subscription.activated", it means payment succeeded.
        # Check if there is an OLD subscription (prev_sub_id) and cancel it now.
        if event_type == "subscription.activated" and prev_sub_id:
            # Verify we aren't cancelling the one we just bought
            if prev_sub_id != entity.get("id"):
                cancel_subscription_safely(prev_sub_id)

        # Also generic check: if DB has a DIFFERENT active sub ID, cancel it
        if event_type == "subscription.activated" and sub.subscription_id and sub.subscription_id != entity.get("id"):
             cancel_subscription_safely(sub.subscription_id)

        # Update DB
        sub.subscription_id = entity.get("id")
        sub.customer_id = entity.get("customer_id")
        sub.status = entity.get("status")
        sub.plan_id = plan_id or sub.plan_id
        sub.current_period_start = ts_to_dt(entity.get("current_start"))
        sub.current_period_end = ts_to_dt(entity.get("current_end"))

        if event_type == "subscription.activated":
            sub.monthly_char_used = 0

        session.add(sub)

        session.add(
            SubscriptionEvent(
                user_id=user_id,
                subscription_id=sub.subscription_id,
                event_type=event_type,
                event_data=payload,
            )
        )

        session.commit()

    return {"status": "success"}

# ------------------------------------------------------------------
# STATUS
# ------------------------------------------------------------------

@subscription_router.get("/status")
async def get_status(
    token_payload=Depends(clerk_auth),
    session: Session = Depends(get_session),
):
    from src.api.utils import SUBSCRIPTION_LIMITS, DEFAULT_LIMIT

    user_id = token_payload.decoded.get("sub")
    sub = session.get(UserSubscription, user_id)

    if not sub:
        return {
            "plan_id": "explorer",
            "plan_name": "Explorer",
            "status": "free",
            "monthly_char_limit": DEFAULT_LIMIT,
            "monthly_char_used": 0,
        }

    return {
        "plan_id": sub.plan_id,
        "plan_name": PLAN_NAMES.get(sub.plan_id, "Explorer"),
        "status": sub.status,
        "monthly_char_limit": SUBSCRIPTION_LIMITS.get(sub.plan_id, DEFAULT_LIMIT),
        "monthly_char_used": sub.monthly_char_used,
        "current_period_end": sub.current_period_end.isoformat()
        if sub.current_period_end
        else None,
    }
