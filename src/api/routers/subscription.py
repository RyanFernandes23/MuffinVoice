# src/api/routers/subscription.py
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from sqlmodel import Session, select
import os, hmac, hashlib, httpx
from datetime import datetime, timezone
from src.api.utils import get_session, engine
from src.api.schema import UserSubscription
from src.api.deps import (
    clerk_auth,
    logger,
    LS_SIGNING_SECRET,
    LS_API_KEY,
    LS_API_URL,
    LS_STORE_ID,
    LS_CREATOR_VARIANT_ID,
    LS_PROFESSIONAL_VARIANT_ID,
)


subscription_router = APIRouter(
    prefix="/api/subscription", tags=["subscription", "webhook"]
)


class CheckoutRequest(BaseModel):
    variant_id: str


VALID_VARIANT_IDS = {LS_CREATOR_VARIANT_ID, LS_PROFESSIONAL_VARIANT_ID}

PLAN_NAMES = {
    LS_CREATOR_VARIANT_ID: "Creator",
    LS_PROFESSIONAL_VARIANT_ID: "Professional",
}


async def create_lemon_squeezy_checkout(
    variant_id: str, user_id: str, user_email: str
) -> str:
    checkout_url = f"{LS_API_URL}/checkouts"
    payload = {
        "data": {
            "type": "checkouts",
            "attributes": {
                "store_id": LS_STORE_ID,
                "variant_id": variant_id,
                "custom_data": {
                    "user_id": user_id,
                },
                "email": user_email,
            },
        }
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(
            checkout_url,
            json=payload,
            headers={
                "Authorization": f"Bearer {LS_API_KEY}",
                "Accept": "application/vnd.api+json",
                "Content-Type": "application/vnd.api+json",
            },
            timeout=30.0,
        )
        if response.status_code != 201:
            logger.error(f"LS checkout creation failed: {response.text}")
            raise HTTPException(
                status_code=500, detail="Failed to create checkout session"
            )
        data = response.json()
        return data["data"]["attributes"]["url"]


async def create_lemon_squeezy_portal(customer_id: str, return_url: str) -> str:
    portal_url = f"{LS_API_URL}/customers/{customer_id}/portal"
    payload = {
        "data": {
            "type": "portal-sessions",
            "attributes": {
                "return_url": return_url,
            },
        }
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(
            portal_url,
            json=payload,
            headers={
                "Authorization": f"Bearer {LS_API_KEY}",
                "Accept": "application/vnd.api+json",
                "Content-Type": "application/vnd.api+json",
            },
            timeout=30.0,
        )
        if response.status_code != 200:
            logger.error(f"LS portal creation failed: {response.text}")
            raise HTTPException(
                status_code=500, detail="Failed to create portal session"
            )
        data = response.json()
        return data["data"]["attributes"]["url"]


def check_user_access(user_id: str, session: Session):
    sub = session.get(UserSubscription, user_id)

    if not sub:
        return False  # No subscription ever

    # LOGIC: Allow if active OR (cancelled but still in paid period)
    is_active = sub.status == "active"
    is_grace_period = (
        sub.status == "cancelled"
        and sub.current_period_end
        and sub.current_period_end > datetime.now(timezone.utc)
    )

    if is_active or is_grace_period:
        return True

    return False


@subscription_router.post("/webhook")
async def lemonsqueezy_webhook(request: Request):
    # 1. Verify Signature
    signature = request.headers.get("X-Signature")
    raw_body = await request.body()

    if not LS_SIGNING_SECRET:
        logger.error("LS_SIGNING_SECRET not configured")
        raise HTTPException(status_code=500, detail="Webhook configuration error")

    expected_signature = hmac.new(
        LS_SIGNING_SECRET.encode(), raw_body, hashlib.sha256
    ).hexdigest()

    if not signature or not hmac.compare_digest(signature, expected_signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # 2. Process Event
    payload = await request.json()
    event_name = payload["meta"]["event_name"]

    if event_name in [
        "subscription_created",
        "subscription_updated",
        "subscription_cancelled",
        "subscription_expired",
    ]:
        # 1. Extract data safely
        data = payload["data"]["attributes"]
        user_id = payload["meta"]["custom_data"].get("user_id")  # passed from checkout
        if not user_id:
            logger.error(f"Webhook {event_name} missing user_id in custom_data")
            return {"status": "error", "message": "user_id missing"}

        sub_id = payload["data"]["id"]
        customer_id = data["customer_id"]
        variant_id = str(data["variant_id"])
        status = data["status"]

        # Convert ISO string to datetime
        ends_at_str = data["ends_at"]
        ends_at = datetime.fromisoformat(ends_at_str) if ends_at_str else None

        # 2. Database Operation
        with Session(engine) as session:
            # Check if record exists
            sub = session.get(UserSubscription, user_id)

            if not sub:
                sub = UserSubscription(
                    user_id=user_id,
                    subscription_id=sub_id,
                    customer_id=customer_id,
                    variant_id=variant_id,
                    status=status,
                    current_period_end=ends_at,
                )
            else:
                # Check if plan is changing (upgrade/downgrade)
                # Reset usage count when upgrading or changing plans
                plan_changed = sub.variant_id != variant_id

                # Update fields
                sub.subscription_id = sub_id
                sub.customer_id = customer_id
                sub.variant_id = variant_id
                sub.status = status
                sub.current_period_end = ends_at
                sub.updated_at = datetime.now(timezone.utc)

                # Reset usage count when plan changes to creator or professional
                if plan_changed and variant_id in VALID_VARIANT_IDS:
                    sub.monthly_char_used = 0
                    sub.last_usage_reset_at = datetime.now(timezone.utc)
                    logger.info(
                        f"Usage count reset for user {user_id} due to plan change to {PLAN_NAMES.get(variant_id, 'Unknown')}"
                    )

            session.add(sub)
            session.commit()

            logger.info(f"Subscription {event_name} processed for user {user_id}")

    return {"status": "processed"}


@subscription_router.get("/usage")
async def get_usage(
    token_payload=Depends(clerk_auth), session: Session = Depends(get_session)
):
    """
    Retrieves the user's current character usage against their monthly limit,
    along with their current plan information.
    """
    from src.api.utils import (
        SUBSCRIPTION_LIMITS,
        DEFAULT_LIMIT,
    )  # Need to import limits

    user_id = token_payload.decoded.get("sub")
    sub = session.get(UserSubscription, user_id)

    limit = DEFAULT_LIMIT
    monthly_char_used = 0
    current_period_end = None
    plan_name = "Explorer"
    plan_variant_id = None

    if sub:
        plan_variant_id = sub.variant_id
        plan_name = PLAN_NAMES.get(sub.variant_id, "Explorer")
        limit = SUBSCRIPTION_LIMITS.get(sub.variant_id, DEFAULT_LIMIT)
        monthly_char_used = sub.monthly_char_used
        current_period_end = (
            sub.current_period_end.isoformat() if sub.current_period_end else None
        )

    return {
        "user_id": user_id,
        "monthly_char_used": monthly_char_used,
        "monthly_char_limit": limit,
        "current_period_end": current_period_end,
        "plan_name": plan_name,
        "plan_variant_id": plan_variant_id,
    }


@subscription_router.get("/plan")
async def get_plan(
    token_payload=Depends(clerk_auth), session: Session = Depends(get_session)
):
    """
    Retrieves the user's current plan information.
    """
    user_id = token_payload.decoded.get("sub")
    sub = session.get(UserSubscription, user_id)

    if not sub:
        return {
            "user_id": user_id,
            "plan_name": "Explorer",
            "plan_variant_id": None,
            "status": "free",
        }

    return {
        "user_id": user_id,
        "plan_name": PLAN_NAMES.get(sub.variant_id, "Explorer"),
        "plan_variant_id": sub.variant_id,
        "status": sub.status,
        "current_period_end": sub.current_period_end.isoformat()
        if sub.current_period_end
        else None,
    }


@subscription_router.get("/portal-link")
async def get_portal_link(
    token_payload=Depends(clerk_auth), session: Session = Depends(get_session)
):
    """
    Generates a secure link to the Lemon Squeezy customer portal.
    """
    user_id = token_payload.decoded.get("sub")
    sub = session.get(UserSubscription, user_id)

    if not sub or not sub.customer_id:
        raise HTTPException(
            status_code=404, detail="Subscription not found or customer ID missing."
        )

    return_url = os.getenv("FRONTEND_URL", "http://localhost:5173") + "/billing"
    portal_url = await create_lemon_squeezy_portal(sub.customer_id, return_url)
    return {"portal_url": portal_url}


@subscription_router.post("/checkout")
async def create_checkout_session(
    request: CheckoutRequest,
    token_payload=Depends(clerk_auth),
    session: Session = Depends(get_session),
):
    """
    Create a Lemon Squeezy checkout session or redirect to portal for existing subscribers.
    Hybrid logic:
    - New user -> Create checkout session
    - Active subscriber on same tier -> Show error (cannot buy same tier twice)
    - Active subscriber on different tier -> Redirect to customer portal (upgrade/downgrade)
    - Past due/cancelled -> Create checkout (pre-filled email)
    """
    user_id = token_payload.decoded.get("sub")
    user_email = token_payload.decoded.get("email")

    if not LS_API_KEY or not LS_STORE_ID:
        logger.error("Lemon Squeezy API configuration missing")
        raise HTTPException(status_code=500, detail="Payment service misconfigured")

    if request.variant_id not in VALID_VARIANT_IDS:
        raise HTTPException(status_code=400, detail="Invalid variant_id")

    sub = session.get(UserSubscription, user_id)

    if sub and sub.status == "active":
        # Check if user is trying to buy the same tier
        if sub.variant_id == request.variant_id:
            raise HTTPException(
                status_code=400,
                detail=f"You are already on the {PLAN_NAMES.get(sub.variant_id, 'current')} plan. Please upgrade or downgrade through the billing portal.",
            )

        # Different tier - redirect to portal for upgrade/downgrade
        if sub.customer_id:
            return_url = os.getenv("FRONTEND_URL", "http://localhost:5173") + "/billing"
            portal_url = await create_lemon_squeezy_portal(sub.customer_id, return_url)
            return {"redirect_to": portal_url, "reason": "upgrade_downgrade"}
        else:
            logger.warning(f"Active sub missing customer_id for user {user_id}")

    checkout_url = await create_lemon_squeezy_checkout(
        variant_id=request.variant_id,
        user_id=user_id,
        user_email=user_email or "",
    )
    return {"checkout_url": checkout_url}
