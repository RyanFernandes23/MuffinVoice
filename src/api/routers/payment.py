import razorpay
import json
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
    user_id: str  # Assuming user_id is passed in the request for this example


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


# Event handlers mapping for Razorpay webhooks
EVENT_HANDLERS = {}


def handle_unhandled_event(event_type: str, payload: dict, db: Session):
    """Handle unknown/unhandled webhook event types."""
    print(f"[WEBHOOK] Unhandled event type: {event_type}")
    # Optionally log to database or monitoring system
    pass


@router.post("/create-subscription")
async def create_subscription(
    request: SubscriptionRequest,
    db: Session = Depends(get_session),  # Add DB session dependency
):
    """
    Create a subscription on Razorpay and return the subscription_id.
    This endpoint now incorporates database operations to manage payment and plan details.
    """
    try:
        # 1. Validate User and Plan from Database
        # Assume user_id comes from an authenticated context or request.
        # For this example, it's part of SubscriptionRequest.
        db_user = db.exec(select(User).where(User.user_id == request.user_id)).first()
        if not db_user:
            raise HTTPException(status_code=404, detail="User not found")

        db_plan = db.exec(
            select(Plan).where(Plan.name == request.plan_name.lower())
        ).first()
        if not db_plan:
            raise HTTPException(
                status_code=404, detail=f"Plan '{request.plan_name}' not found"
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
            user_id=request.user_id,  # Assuming user_id is always available from request
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
