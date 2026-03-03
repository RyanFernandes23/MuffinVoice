import razorpay
import json
from typing import Optional
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel
from sqlmodel import Session, select  # Add select
from datetime import datetime, timezone  # Ensure these are imported
import os
from ..config import settings
from ..schema import (
    Plan,
    Payment,
    PaymentEvent,
    User,
    Subscription,
)  # Import new models
from ..utils import get_session  # Import get_session from utils
from ..token_utils import reset_user_tokens  # Import token utilities from token_utils
from ..deps import clerk_auth  # Import clerk_auth for JWT validation

router = APIRouter(
    prefix="/payment",
    tags=["Payment"],
)


def safe_get(data, *keys):
    """Safely extract nested values, handling both dicts and lists.

    For list elements, if the key is a string (like "entity"), it looks up that
    key in the first element of the list. Integer keys are treated as indices.
    """
    current = data
    for key in keys:
        if current is None:
            return None
        if isinstance(current, dict):
            current = current.get(key)
        elif isinstance(current, list):
            if not current:
                return None
            first_item = current[0]
            if isinstance(first_item, dict):
                if isinstance(key, str):
                    current = first_item.get(key)
                else:
                    try:
                        idx = int(key)
                        current = current[idx] if idx < len(current) else None
                    except (ValueError, TypeError):
                        return None
            else:
                return None
        else:
            return None
    return current


client = razorpay.Client(
    auth=(settings.razorpay_key_id, settings.razorpay_key_secret)
)  # RE-ADDED


class SubscriptionRequest(BaseModel):
    plan_name: str
    currency: Optional[str] = "USD"


class WebhookRequest(BaseModel):
    event: str
    payload: dict


def verify_razorpay_signature(payment_id: str, order_id: str, signature: str) -> bool:
    try:
        client.utility.verify_payment_signature(
            {
                "razorpay_payment_id": payment_id,
                "razorpay_order_id": order_id,
                "razorpay_signature": signature,
            }
        )
        return True
    except Exception:
        return False


def verify_webhook_signature(raw_body: bytes, signature: str) -> bool:
    try:
        webhook_secret = settings.razorpay_webhook_secret
        print(f"[DEBUG] Verifying webhook signature...")
        print(
            f"[DEBUG] Signature: {signature[:20]}..."
            if signature
            else "[DEBUG] Signature: None"
        )
        print(
            f"[DEBUG] Webhook secret: {webhook_secret[:10]}..."
            if webhook_secret
            else "[DEBUG] Webhook secret: None"
        )
        print(f"[DEBUG] Raw body length: {len(raw_body)} bytes")

        client.utility.verify_webhook_signature(
            raw_body.decode("utf-8"),
            signature,
            webhook_secret,
        )
        print("[DEBUG] Signature verification passed!")
        return True
    except Exception as e:
        print(f"[DEBUG] Signature verification failed: {e}")
        return False


# ==================== Subscription Event Handlers ====================


def _convert_timestamp(timestamp_val):
    """Convert Unix timestamp (int) or ISO string to datetime."""
    if isinstance(timestamp_val, int):
        return datetime.fromtimestamp(timestamp_val, tz=timezone.utc)
    elif isinstance(timestamp_val, str):
        return datetime.fromisoformat(timestamp_val.replace("Z", "+00:00"))
    return datetime.now(timezone.utc)


def handle_subscription_activated(payload: dict, db: Session):
    """Handle subscription.activated event."""
    try:
        subscription_data = safe_get(payload, "subscription", "entity")
        if not subscription_data:
            print("[WEBHOOK] Missing subscription data in payload")
            return

        razorpay_sub_id = subscription_data.get("id")
        user_id = safe_get(subscription_data, "notes", "app_user_id")
        plan_id = safe_get(subscription_data, "notes", "app_plan_id")
        payment_id = safe_get(subscription_data, "notes", "app_payment_id")

        if not user_id or not plan_id:
            print("[WEBHOOK] Missing user_id or plan_id in subscription notes")
            return

        # Update or create subscription record
        existing_sub = db.exec(
            select(Subscription).where(
                Subscription.razorpay_subscription_id == razorpay_sub_id
            )
        ).first()

        start_dt = (
            _convert_timestamp(subscription_data.get("start_at"))
            if subscription_data.get("start_at")
            else datetime.now(timezone.utc)
        )
        end_dt = (
            _convert_timestamp(subscription_data.get("end_at"))
            if subscription_data.get("end_at")
            else datetime.now(timezone.utc)
        )

        if existing_sub:
            existing_sub.status = "active"
            existing_sub.start_date = start_dt.date()
            existing_sub.updated_at = datetime.now(timezone.utc)
            db.add(existing_sub)
        else:
            new_sub = Subscription(
                razorpay_subscription_id=razorpay_sub_id,
                user_id=user_id,
                plan_id=plan_id,
                payment_id=payment_id,
                start_date=start_dt.date(),
                end_date=end_dt.date(),
                status="active",
                auto_renew_enabled=subscription_data.get("auto_renew", False),
            )
            db.add(new_sub)

        # Log the event
        event_log = PaymentEvent(
            user_id=user_id,
            payment_id=payment_id,
            subscription_id=razorpay_sub_id,
            event_type="subscription_activated",
            event_description="Subscription successfully activated",
        )
        db.add(event_log)

        # Reset user tokens to new plan limit
        plan = db.exec(select(Plan).where(Plan.plan_id == plan_id)).first()
        if plan:
            reset_user_tokens(
                session=db,
                user_id=user_id,
                new_token_limit=plan.token_limit,
                reason="subscription_activated",
            )
            print(f"[WEBHOOK] Reset tokens to {plan.token_limit} for user {user_id}")

        db.commit()

        # Cancel any OTHER active subscriptions for this user (upgrade scenario).
        # This ensures the old plan is only cancelled AFTER the new one is paid & active.
        other_active_subs = db.exec(
            select(Subscription).where(
                Subscription.user_id == user_id,
                Subscription.status == "active",
                Subscription.razorpay_subscription_id != razorpay_sub_id,
            )
        ).all()

        for old_sub in other_active_subs:
            try:
                client.subscription.cancel(old_sub.razorpay_subscription_id)
                print(f"[WEBHOOK] Cancelled old Razorpay subscription {old_sub.razorpay_subscription_id}")
            except Exception as cancel_err:
                print(f"[WEBHOOK] Warning: cancel API call failed for {old_sub.razorpay_subscription_id}: {cancel_err}")

            old_sub.status = "cancelled"
            old_sub.cancelled_at = datetime.now(timezone.utc)
            old_sub.cancel_reason = "Replaced by upgraded subscription"
            old_sub.updated_at = datetime.now(timezone.utc)
            db.add(old_sub)

            cancel_event = PaymentEvent(
                user_id=user_id,
                subscription_id=old_sub.razorpay_subscription_id,
                event_type="subscription_cancelled_for_upgrade",
                event_description=f"Old subscription cancelled after new subscription {razorpay_sub_id} activated",
            )
            db.add(cancel_event)

        if other_active_subs:
            db.commit()
            print(f"[WEBHOOK] Cancelled {len(other_active_subs)} old subscription(s) for user {user_id}")

        print(f"[WEBHOOK] Subscription {razorpay_sub_id} activated for user {user_id}")
    except Exception as e:
        print(f"[WEBHOOK] Error handling subscription.activated: {str(e)}")
        db.rollback()


def handle_subscription_updated(payload: dict, db: Session):
    """Handle subscription.updated event."""
    try:
        subscription_data = safe_get(payload, "subscription", "entity")
        if not subscription_data:
            return

        razorpay_sub_id = subscription_data.get("id")
        user_id = safe_get(subscription_data, "notes", "app_user_id")

        existing_sub = db.exec(
            select(Subscription).where(
                Subscription.razorpay_subscription_id == razorpay_sub_id
            )
        ).first()

        if existing_sub:
            end_dt = (
                _convert_timestamp(subscription_data.get("end_at"))
                if subscription_data.get("end_at")
                else None
            )
            existing_sub.end_date = end_dt.date() if end_dt else existing_sub.end_date
            existing_sub.auto_renew_enabled = subscription_data.get(
                "auto_renew", existing_sub.auto_renew_enabled
            )
            existing_sub.updated_at = datetime.now(timezone.utc)
            db.add(existing_sub)

            event_log = PaymentEvent(
                user_id=user_id or existing_sub.user_id,
                subscription_id=razorpay_sub_id,
                event_type="subscription_updated",
                event_description="Subscription details updated",
            )
            db.add(event_log)
            db.commit()

            print(f"[WEBHOOK] Subscription {razorpay_sub_id} updated")
    except Exception as e:
        print(f"[WEBHOOK] Error handling subscription.updated: {str(e)}")
        db.rollback()


def handle_subscription_paused(payload: dict, db: Session):
    """Handle subscription.paused event."""
    try:
        subscription_data = safe_get(payload, "subscription", "entity")
        if not subscription_data:
            return

        razorpay_sub_id = subscription_data.get("id")
        user_id = safe_get(subscription_data, "notes", "app_user_id")

        existing_sub = db.exec(
            select(Subscription).where(
                Subscription.razorpay_subscription_id == razorpay_sub_id
            )
        ).first()

        if existing_sub:
            existing_sub.status = "paused"
            existing_sub.updated_at = datetime.now(timezone.utc)
            db.add(existing_sub)

            event_log = PaymentEvent(
                user_id=user_id or existing_sub.user_id,
                subscription_id=razorpay_sub_id,
                event_type="subscription_paused",
                event_description="Subscription paused by system or user",
            )
            db.add(event_log)
            db.commit()

            print(f"[WEBHOOK] Subscription {razorpay_sub_id} paused")
    except Exception as e:
        print(f"[WEBHOOK] Error handling subscription.paused: {str(e)}")
        db.rollback()


def handle_subscription_resumed(payload: dict, db: Session):
    """Handle subscription.resumed event."""
    try:
        subscription_data = safe_get(payload, "subscription", "entity")
        if not subscription_data:
            return

        razorpay_sub_id = subscription_data.get("id")
        user_id = safe_get(subscription_data, "notes", "app_user_id")

        existing_sub = db.exec(
            select(Subscription).where(
                Subscription.razorpay_subscription_id == razorpay_sub_id
            )
        ).first()

        if existing_sub:
            existing_sub.status = "active"
            existing_sub.updated_at = datetime.now(timezone.utc)
            db.add(existing_sub)

            event_log = PaymentEvent(
                user_id=user_id or existing_sub.user_id,
                subscription_id=razorpay_sub_id,
                event_type="subscription_resumed",
                event_description="Subscription resumed",
            )
            db.add(event_log)
            db.commit()

            print(f"[WEBHOOK] Subscription {razorpay_sub_id} resumed")
    except Exception as e:
        print(f"[WEBHOOK] Error handling subscription.resumed: {str(e)}")
        db.rollback()


def handle_subscription_cancelled(payload: dict, db: Session):
    """Handle subscription.cancelled event."""
    try:
        subscription_data = safe_get(payload, "subscription", "entity")
        if not subscription_data:
            return

        razorpay_sub_id = subscription_data.get("id")
        user_id = safe_get(subscription_data, "notes", "app_user_id")

        existing_sub = db.exec(
            select(Subscription).where(
                Subscription.razorpay_subscription_id == razorpay_sub_id
            )
        ).first()

        if existing_sub:
            existing_sub.status = "cancelled"
            existing_sub.cancelled_at = datetime.now(timezone.utc)
            existing_sub.cancel_reason = (
                subscription_data.get("short_url") or "Cancelled via webhook"
            )
            existing_sub.updated_at = datetime.now(timezone.utc)
            db.add(existing_sub)

            event_log = PaymentEvent(
                user_id=user_id or existing_sub.user_id,
                subscription_id=razorpay_sub_id,
                event_type="subscription_cancelled",
                event_description="Subscription cancelled",
            )
            db.add(event_log)
            db.commit()

            print(f"[WEBHOOK] Subscription {razorpay_sub_id} cancelled")
    except Exception as e:
        print(f"[WEBHOOK] Error handling subscription.cancelled: {str(e)}")
        db.rollback()


def handle_subscription_expired(payload: dict, db: Session):
    """Handle subscription.expired event."""
    try:
        subscription_data = safe_get(payload, "subscription", "entity")
        if not subscription_data:
            return

        razorpay_sub_id = subscription_data.get("id")
        user_id = safe_get(subscription_data, "notes", "app_user_id")

        existing_sub = db.exec(
            select(Subscription).where(
                Subscription.razorpay_subscription_id == razorpay_sub_id
            )
        ).first()

        if existing_sub:
            existing_sub.status = "expired"
            existing_sub.updated_at = datetime.now(timezone.utc)
            db.add(existing_sub)

            event_log = PaymentEvent(
                user_id=user_id or existing_sub.user_id,
                subscription_id=razorpay_sub_id,
                event_type="subscription_expired",
                event_description="Subscription period expired",
            )
            db.add(event_log)

            # Reset user tokens to Explorer plan (40k tokens)
            explorer_plan = db.exec(select(Plan).where(Plan.name == "explorer")).first()
            if explorer_plan:
                reset_user_tokens(
                    session=db,
                    user_id=user_id or existing_sub.user_id,
                    new_token_limit=explorer_plan.token_limit,
                    reason="subscription_expired",
                )
                print(
                    f"[WEBHOOK] Subscription expired, reset to Explorer ({explorer_plan.token_limit} tokens) for user {user_id or existing_sub.user_id}"
                )

            db.commit()

            print(f"[WEBHOOK] Subscription {razorpay_sub_id} expired")
    except Exception as e:
        print(f"[WEBHOOK] Error handling subscription.expired: {str(e)}")
        db.rollback()


def handle_subscription_halted(payload: dict, db: Session):
    """Handle subscription.halted event (halted due to failed payments)."""
    try:
        subscription_data = safe_get(payload, "subscription", "entity")
        if not subscription_data:
            return

        razorpay_sub_id = subscription_data.get("id")
        user_id = safe_get(subscription_data, "notes", "app_user_id")

        existing_sub = db.exec(
            select(Subscription).where(
                Subscription.razorpay_subscription_id == razorpay_sub_id
            )
        ).first()

        if existing_sub:
            existing_sub.status = "halted"
            existing_sub.updated_at = datetime.now(timezone.utc)
            db.add(existing_sub)

            event_log = PaymentEvent(
                user_id=user_id or existing_sub.user_id,
                subscription_id=razorpay_sub_id,
                event_type="subscription_halted",
                event_description="Subscription halted due to payment failures",
                error_code="PAYMENT_FAILURE",
            )
            db.add(event_log)
            db.commit()

            print(
                f"[WEBHOOK] Subscription {razorpay_sub_id} halted due to payment failure"
            )
    except Exception as e:
        print(f"[WEBHOOK] Error handling subscription.halted: {str(e)}")
        db.rollback()


def handle_subscription_completed(payload: dict, db: Session):
    """Handle subscription.completed event."""
    try:
        subscription_data = safe_get(payload, "subscription", "entity")
        if not subscription_data:
            return

        razorpay_sub_id = subscription_data.get("id")
        user_id = safe_get(subscription_data, "notes", "app_user_id")

        existing_sub = db.exec(
            select(Subscription).where(
                Subscription.razorpay_subscription_id == razorpay_sub_id
            )
        ).first()

        if existing_sub:
            existing_sub.status = "completed"
            existing_sub.updated_at = datetime.now(timezone.utc)
            db.add(existing_sub)

            event_log = PaymentEvent(
                user_id=user_id or existing_sub.user_id,
                subscription_id=razorpay_sub_id,
                event_type="subscription_completed",
                event_description="Subscription completed",
            )
            db.add(event_log)
            db.commit()

            print(f"[WEBHOOK] Subscription {razorpay_sub_id} completed")
    except Exception as e:
        print(f"[WEBHOOK] Error handling subscription.completed: {str(e)}")
        db.rollback()


# ==================== Payment Event Handlers ====================


def handle_payment_authorized(payload: dict, db: Session):
    """Handle payment.authorized event."""
    try:
        payment_data = safe_get(payload, "payment", "entity")
        if not payment_data:
            return

        razorpay_payment_id = payment_data.get("id")
        user_id = safe_get(payment_data, "notes", "app_user_id")
        payment_id = safe_get(payment_data, "notes", "app_payment_id")

        if payment_id:
            payment = db.exec(
                select(Payment).where(Payment.payment_id == payment_id)
            ).first()
            if payment:
                payment.gateway_payment_id = razorpay_payment_id
                payment.status = "authorized"
                payment.payment_method = payment_data.get("method")
                payment.updated_at = datetime.now(timezone.utc)
                db.add(payment)

                event_log = PaymentEvent(
                    user_id=user_id or payment.user_id,
                    payment_id=payment_id,
                    event_type="payment_authorized",
                    event_description="Payment authorized",
                )
                db.add(event_log)
                db.commit()

                print(f"[WEBHOOK] Payment {razorpay_payment_id} authorized")
    except Exception as e:
        print(f"[WEBHOOK] Error handling payment.authorized: {str(e)}")
        db.rollback()


def handle_payment_captured(payload: dict, db: Session):
    """Handle payment.captured event."""
    try:
        payment_data = safe_get(payload, "payment", "entity")
        if not payment_data:
            return

        razorpay_payment_id = payment_data.get("id")
        user_id = safe_get(payment_data, "notes", "app_user_id")
        payment_id = safe_get(payment_data, "notes", "app_payment_id")

        if payment_id:
            payment = db.exec(
                select(Payment).where(Payment.payment_id == payment_id)
            ).first()
            if payment:
                payment.gateway_payment_id = razorpay_payment_id
                payment.status = "captured"
                payment.payment_method = payment_data.get("method")
                payment.updated_at = datetime.now(timezone.utc)
                db.add(payment)

                event_log = PaymentEvent(
                    user_id=user_id or payment.user_id,
                    payment_id=payment_id,
                    event_type="payment_captured",
                    event_description="Payment successfully captured",
                )
                db.add(event_log)
                db.commit()

                print(f"[WEBHOOK] Payment {razorpay_payment_id} captured")
    except Exception as e:
        print(f"[WEBHOOK] Error handling payment.captured: {str(e)}")
        db.rollback()


def handle_payment_failed(payload: dict, db: Session):
    """Handle payment.failed event."""
    try:
        payment_data = safe_get(payload, "payment", "entity")
        if not payment_data:
            return

        razorpay_payment_id = payment_data.get("id")
        user_id = safe_get(payment_data, "notes", "app_user_id")
        payment_id = safe_get(payment_data, "notes", "app_payment_id")
        error_code = payment_data.get("error_code")
        error_description = payment_data.get("error_description")

        if payment_id:
            payment = db.exec(
                select(Payment).where(Payment.payment_id == payment_id)
            ).first()
            if payment:
                payment.gateway_payment_id = razorpay_payment_id
                payment.status = "failed"
                payment.gateway_response_code = error_code
                payment.gateway_response_message = error_description
                payment.updated_at = datetime.now(timezone.utc)
                db.add(payment)

                event_log = PaymentEvent(
                    user_id=user_id or payment.user_id,
                    payment_id=payment_id,
                    event_type="payment_failed",
                    event_description=f"Payment failed: {error_description}",
                    error_code=error_code,
                    error_details={
                        "reason": payment_data.get("reason"),
                        "error_code": error_code,
                        "error_description": error_description,
                    },
                )
                db.add(event_log)
                db.commit()

                print(
                    f"[WEBHOOK] Payment {razorpay_payment_id} failed with error {error_code}"
                )
    except Exception as e:
        print(f"[WEBHOOK] Error handling payment.failed: {str(e)}")
        db.rollback()


def handle_subscription_authenticated(payload: dict, db: Session):
    """Handle subscription.authenticated event."""
    try:
        subscription_data = safe_get(payload, "subscription", "entity")
        if not subscription_data:
            return

        razorpay_sub_id = subscription_data.get("id")
        user_id = safe_get(subscription_data, "notes", "app_user_id")

        # Log the authentication event
        event_log = PaymentEvent(
            user_id=user_id or "system",
            subscription_id=razorpay_sub_id,
            event_type="subscription_authenticated",
            event_description="Subscription authenticated",
        )
        db.add(event_log)
        db.commit()

        print(f"[WEBHOOK] Subscription {razorpay_sub_id} authenticated")
    except Exception as e:
        print(f"[WEBHOOK] Error handling subscription.authenticated: {str(e)}")
        db.rollback()


def handle_subscription_charged(payload: dict, db: Session):
    """Handle subscription.charged event."""
    try:
        subscription_data = safe_get(payload, "subscription", "entity")
        payment_data = safe_get(payload, "payment", "entity")

        if not subscription_data and not payment_data:
            return

        razorpay_sub_id = subscription_data.get("id") if subscription_data else None
        razorpay_payment_id = payment_data.get("id") if payment_data else None
        user_id = safe_get(subscription_data or payment_data, "notes", "app_user_id")
        payment_id = safe_get(
            subscription_data or payment_data, "notes", "app_payment_id"
        )

        # Update payment if exists
        if payment_id:
            payment = db.exec(
                select(Payment).where(Payment.payment_id == payment_id)
            ).first()
            if payment:
                payment.status = "charged"
                payment.gateway_payment_id = razorpay_payment_id
                payment.updated_at = datetime.now(timezone.utc)
                db.add(payment)

        # Log the charge event
        event_log = PaymentEvent(
            user_id=user_id or "system",
            payment_id=payment_id,
            subscription_id=razorpay_sub_id,
            event_type="subscription_charged",
            event_description="Subscription charged successfully",
        )
        db.add(event_log)
        db.commit()

        print(
            f"[WEBHOOK] Subscription {razorpay_sub_id} charged with payment {razorpay_payment_id}"
        )
    except Exception as e:
        print(f"[WEBHOOK] Error handling subscription.charged: {str(e)}")
        db.rollback()


def handle_unhandled_event(event_type: str, payload: dict, db: Session):
    """Handle unknown/unhandled webhook event types."""
    try:
        # Extract basic information for logging
        user_id = (
            safe_get(payload, "subscription", "entity", "notes", "app_user_id")
            or safe_get(payload, "payment", "entity", "notes", "app_user_id")
            or "system"
        )

        payment_id = safe_get(payload, "payment", "entity", "notes", "app_payment_id")
        # Only set subscription_id if it exists in the database to avoid foreign key constraint
        subscription_id_from_payload = safe_get(payload, "subscription", "entity", "id")
        subscription_id = None

        if subscription_id_from_payload:
            existing_sub = db.exec(
                select(Subscription).where(
                    Subscription.razorpay_subscription_id
                    == subscription_id_from_payload
                )
            ).first()
            if existing_sub:
                subscription_id = subscription_id_from_payload

        # Log unhandled events to database for review
        event_log = PaymentEvent(
            user_id=user_id,
            payment_id=payment_id,
            subscription_id=subscription_id,  # Only set if exists in DB
            event_type=f"unhandled_{event_type}",
            event_description=f"Unhandled event type: {event_type}",
            error_details={"event_type": event_type, "payload": payload},
        )
        db.add(event_log)
        db.commit()

        print(f"[WEBHOOK] Unhandled event type logged: {event_type} for user {user_id}")
    except Exception as e:
        print(f"[WEBHOOK] Error logging unhandled event: {str(e)}")
        db.rollback()


# ==================== Event Handler Registry ====================

# Register all event handlers
EVENT_HANDLERS = {
    "subscription.activated": handle_subscription_activated,
    "subscription.authenticated": handle_subscription_authenticated,
    "subscription.charged": handle_subscription_charged,
    "subscription.updated": handle_subscription_updated,
    "subscription.paused": handle_subscription_paused,
    "subscription.resumed": handle_subscription_resumed,
    "subscription.cancelled": handle_subscription_cancelled,
    "subscription.expired": handle_subscription_expired,
    "subscription.halted": handle_subscription_halted,
    "subscription.completed": handle_subscription_completed,
    "payment.authorized": handle_payment_authorized,
    "payment.captured": handle_payment_captured,
    "payment.failed": handle_payment_failed,
}


@router.post("/create-subscription")
async def create_subscription(
    request: SubscriptionRequest,
    token_payload=Depends(clerk_auth),
    db: Session = Depends(get_session),  # Add DB session dependency
):
    """
    Create a subscription on Razorpay and return the subscription_id.
    This endpoint now incorporates database operations to manage payment and plan details.
    JWT authentication is required - user_id is extracted from the token.
    """
    try:
        # Extract user_id from JWT token
        user_id = token_payload.decoded.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: no user ID")

        # 1. Validate User and Plan from Database
        db_user = db.exec(select(User).where(User.user_id == user_id)).first()
        if not db_user:
            raise HTTPException(status_code=404, detail="User not found")

        target_currency = (request.currency or "USD").upper()
        
        db_plan = db.exec(
            select(Plan).where(
                Plan.name == request.plan_name.lower(),
                Plan.currency == target_currency
            )
        ).first()
        
        # Fallback to USD if requested currency plan not found
        if not db_plan and target_currency != "USD":
            db_plan = db.exec(
                select(Plan).where(
                    Plan.name == request.plan_name.lower(),
                    Plan.currency == "USD"
                )
            ).first()

        if not db_plan:
            requested_desc = f"'{request.plan_name}' ({request.currency})"
            raise HTTPException(
                status_code=404, detail=f"Plan {requested_desc} not found"
            )

        if not db_plan.is_active:
            raise HTTPException(
                status_code=400, detail=f"Plan '{request.plan_name}' is not active"
            )

        # Ensure Razorpay Plan ID is available
        if not db_plan.razorpay_plan_id:
            raise HTTPException(
                status_code=500,
                detail=f"Razorpay Plan ID not configured for plan '{request.plan_name}'",
            )

        # Check for existing active subscription (upgrade logic)
        existing_sub = db.exec(
            select(Subscription).where(
                Subscription.user_id == user_id, Subscription.status == "active"
            )
        ).first()

        if existing_sub:
            # Get old plan to check if this is an upgrade
            old_plan = db.exec(
                select(Plan).where(Plan.plan_id == existing_sub.plan_id)
            ).first()

            # Define plan hierarchy
            plan_tiers = {"explorer": 1, "creator": 2, "professional": 3}

            old_tier = plan_tiers.get(old_plan.name, 0) if old_plan else 0
            new_tier = plan_tiers.get(request.plan_name.lower(), 0)

            if new_tier <= old_tier:
                # Downgrade or same plan - not supported
                raise HTTPException(
                    status_code=400,
                    detail="Downgrade not supported. Please contact support.",
                )

            # Upgrade: try editing subscription in Razorpay first
            try:
                client.subscription.edit(
                    existing_sub.razorpay_subscription_id,
                    {  # type: ignore
                        "plan_id": db_plan.razorpay_plan_id,
                        "schedule_change_at": "now",
                    },
                )
                # Update local subscription record
                existing_sub.plan_id = db_plan.plan_id
                existing_sub.updated_at = datetime.now(timezone.utc)
                db.add(existing_sub)
                db.commit()

                # Reset user tokens to new plan limit
                reset_user_tokens(
                    session=db,
                    user_id=user_id,
                    new_token_limit=db_plan.token_limit,
                    reason="plan_upgrade",
                )

                return {
                    "message": "Plan upgraded successfully",
                    "old_plan": old_plan.name if old_plan else "unknown",
                    "new_plan": db_plan.name,
                    "razorpay_subscription_id": existing_sub.razorpay_subscription_id,
                }
            except Exception as edit_err:
                # Edit may fail for UPI subscriptions or other restrictions.
                # DON'T cancel the old subscription here — the user hasn't paid yet.
                # Instead, fall through to create a new subscription.
                # The old subscription will be cancelled automatically by the
                # subscription.activated webhook handler once the new one is paid.
                print(f"[UPGRADE] In-place edit failed ({edit_err}), creating new subscription. Old sub will be cancelled after new one is activated.")
                # Fall through to create a brand-new subscription below

        # 2. Create a pending Payment record in your database
        # This records the initiation of a payment attempt
        new_payment = Payment(
            user_id=db_user.user_id,
            plan_id=db_plan.plan_id,
            amount=db_plan.price,
            currency=db_plan.currency,
            status="initiated",  # Initial status before interacting with gateway
            transaction_timestamp=datetime.now(timezone.utc),
            # Other gateway_ fields will be populated by webhook
        )
        db.add(new_payment)
        db.commit()
        db.refresh(new_payment)

        # 3. Log a PaymentEvent for initiation
        payment_event = PaymentEvent(
            user_id=db_user.user_id,
            payment_id=new_payment.payment_id,
            event_type="payment_initiated",
            event_description=f"Payment initiated for plan '{db_plan.name}'",
        )
        db.add(payment_event)
        db.commit()
        db.refresh(payment_event)

        # 4. Interact with Razorpay to create the subscription
        subscription_data = {
            "plan_id": db_plan.razorpay_plan_id,  # Use Razorpay's specific plan ID from DB
            "total_count": 120,  # auto pay for 10 years, adjust as needed
            "quantity": 1,
            "notes": {
                "app_user_id": db_user.user_id,
                "app_plan_id": db_plan.plan_id,
                "app_payment_id": new_payment.payment_id,
            },
        }

        subscription = client.subscription.create(data=subscription_data)

        # 5. Update the pending Payment record with Razorpay's subscription ID and details
        new_payment.gateway_payment_id = subscription["id"]  # Razorpay subscription ID
        new_payment.status = "authorized"  # Or 'pending'/'created' depending on Razorpay's initial status for subscription
        db.add(new_payment)
        db.commit()
        db.refresh(new_payment)

        # The actual Subscription record in our DB will be created by the webhook handler
        # upon Razorpay confirming subscription.activated.

        return {
            "app_payment_id": new_payment.payment_id,  # Return your internal payment ID
            "razorpay_subscription_id": subscription["id"],
            "key_id": settings.razorpay_key_id,
            "amount": str(db_plan.price),  # Return amount to client for payment display
            "currency": db_plan.currency,  # Return currency to client
        }
    except HTTPException:
        raise  # Re-raise HTTPExceptions
    except Exception as e:
        # Log unexpected errors
        print(f"Error in create_subscription: {e}")
        error_event = PaymentEvent(
            user_id=user_id,
            event_type="create_subscription_error",
            event_description=f"Unexpected error during subscription creation: {str(e)}",
        )
        db.add(error_event)
        db.commit()
        raise HTTPException(
            status_code=500,
            detail="Internal server error during subscription creation.",
        )


@router.post("/webhook")
async def razorpay_webhook(
    request: Request, response: Response, db: Session = Depends(get_session)
):
    user_id = "system"  # Default fallback
    raw_body = None

    try:
        raw_body = await request.body()

        signature = request.headers.get("x-razorpay-signature")
        timestamp = request.headers.get("x-razorpay-timestamp")

        if not signature:
            raise HTTPException(status_code=400, detail="Missing signature")

        # Verify signature FIRST with raw bytes
        if not verify_webhook_signature(raw_body, signature):
            raise HTTPException(status_code=400, detail="Invalid signature")

        # Parse JSON AFTER successful verification
        event_data = json.loads(raw_body.decode())
        event_type = event_data.get("event")
        payload = event_data.get("payload", {})

        # Extract user_id from payload for logging
        user_id = (
            safe_get(payload, "subscription", "entity", "notes", "app_user_id")
            or "system"
        )
        if user_id == "system":
            user_id = (
                safe_get(payload, "payment", "entity", "notes", "app_user_id")
                or "system"
            )

        handler = EVENT_HANDLERS.get(event_type)

        if handler:
            handler(payload, db)
        else:
            handle_unhandled_event(event_type, payload, db)

        response.status_code = 200
        return {"status": "success"}

    except Exception as e:
        print(f"[WEBHOOK] Error: {str(e)}")
        # Log critical error to DB with extracted or fallback user_id
        error_event = PaymentEvent(
            user_id=user_id,
            event_type="webhook_critical_error",
            event_description=f"Critical error in webhook processing: {str(e)}",
        )
        db.add(error_event)
        db.commit()
        raise HTTPException(status_code=500, detail="Internal server error")
