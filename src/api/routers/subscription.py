from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from src.api.deps import clerk_auth, get_current_user, get_session, logger
from src.api.schema import UserSubscription
from src.api.utils import (DEFAULT_LIMIT, EXPLORER_PLAN_ID,
                           SUBSCRIPTION_LIMITS,
                           get_or_create_explorer_subscription)

subscription_router = APIRouter(prefix="/api/subscription", tags=["subscription"])


class UsageResponse(BaseModel):
    monthly_char_used: int
    monthly_char_limit: int
    percentage_used: float
    remaining_characters: int


class SubscriptionStatusResponse(BaseModel):
    plan_id: str
    plan_name: str
    status: str
    monthly_char_limit: int
    monthly_char_used: int
    current_period_end: Optional[str] = None


PLAN_ID_TO_NAME = {
    "explorer": "Explorer",
    "creator": "Creator",
    "professional": "Professional",
}


@subscription_router.get("/usage", response_model=UsageResponse)
async def get_usage(
    token_payload=Depends(clerk_auth), session: Session = Depends(get_session)
):
    """
    Get the current user's character usage statistics.
    Returns monthly character usage, limit, percentage used, and remaining characters.
    """
    user_id = token_payload.decoded.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: no user ID")

    try:
        sub = session.get(UserSubscription, user_id)

        if not sub:
            sub = get_or_create_explorer_subscription(user_id)
            session.refresh(sub)

        limit = SUBSCRIPTION_LIMITS.get(sub.plan_id, DEFAULT_LIMIT)
        used = sub.monthly_char_used
        remaining = max(0, limit - used)
        percentage_used = (used / limit * 100) if limit > 0 else 0

        return UsageResponse(
            monthly_char_used=used,
            monthly_char_limit=limit,
            percentage_used=round(percentage_used, 2),
            remaining_characters=remaining,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching usage for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch usage data")


@subscription_router.get("/status", response_model=SubscriptionStatusResponse)
async def get_subscription_status(
    token_payload=Depends(clerk_auth), session: Session = Depends(get_session)
):
    """
    Get the current user's subscription status including plan details and usage.
    """
    user_id = token_payload.decoded.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: no user ID")

    try:
        sub = session.get(UserSubscription, user_id)

        if not sub:
            sub = get_or_create_explorer_subscription(user_id)
            session.refresh(sub)

        limit = SUBSCRIPTION_LIMITS.get(sub.plan_id, DEFAULT_LIMIT)

        period_end = None
        if sub.current_period_end:
            period_end = sub.current_period_end.isoformat()

        return SubscriptionStatusResponse(
            plan_id=sub.plan_id,
            plan_name=PLAN_ID_TO_NAME.get(sub.plan_id, sub.plan_id.title()),
            status=sub.status,
            monthly_char_limit=limit,
            monthly_char_used=sub.monthly_char_used,
            current_period_end=period_end,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching subscription status for user {user_id}: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to fetch subscription status"
        )
