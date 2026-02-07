import json
from datetime import datetime, timezone
from sqlmodel import Session, select

from src.api.schema import Plan, Payment, PaymentEvent, User, Subscription


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


def handle_subscription_activated(payload: dict, db: Session):
    subscription_entity = safe_get(payload, "subscription", "entity") or {}
    razorpay_subscription_id = subscription_entity.get("id")
    notes = subscription_entity.get("notes", {})
    app_payment_id = notes.get("app_payment_id")

    if not app_payment_id:
        print(
            f"[WEBHOOK] ERROR: app_payment_id not in subscription notes for razorpay_subscription_id: {razorpay_subscription_id}"
        )
        return

    db_payment = db.exec(
        select(Payment).where(Payment.payment_id == app_payment_id)
    ).first()
    if not db_payment:
        print(f"[WEBHOOK] ERROR: Payment record with ID {app_payment_id} not found.")
        return

    # Create a new Subscription record
    new_subscription = Subscription(
        razorpay_subscription_id=razorpay_subscription_id or "",
        user_id=db_payment.user_id,
        plan_id=db_payment.plan_id,
        payment_id=db_payment.payment_id,
        start_date=datetime.fromtimestamp(
            subscription_entity["start_at"], tz=timezone.utc
        ).date(),
        end_date=datetime.fromtimestamp(
            subscription_entity["end_at"], tz=timezone.utc
        ).date(),
        status="active",
        auto_renew_enabled=subscription_entity.get("customer_notify"),
    )
    db.add(new_subscription)

    # Update payment status
    db_payment.status = "captured"
    db_payment.gateway_order_id = subscription_entity.get("id")
    db.add(db_payment)

    # Log event
    event = PaymentEvent(
        user_id=db_payment.user_id,
        payment_id=db_payment.payment_id,
        subscription_id=razorpay_subscription_id,
        event_type="subscription.activated",
        event_description=f"Subscription {razorpay_subscription_id} successfully activated.",
    )
    db.add(event)
    db.commit()
    print(
        f"[WEBHOOK] subscription.activated: Processed for subscription {razorpay_subscription_id}"
    )


def handle_subscription_charged(payload: dict, db: Session):
    payment_entity = safe_get(payload, "payment", "entity") or {}
    subscription_entity = safe_get(payload, "subscription", "entity") or {}
    razorpay_subscription_id = subscription_entity.get("id")

    db_subscription = db.exec(
        select(Subscription).where(
            Subscription.razorpay_subscription_id == razorpay_subscription_id
        )
    ).first()
    if not db_subscription:
        print(f"[WEBHOOK] ERROR: Subscription {razorpay_subscription_id} not found.")
        return

    # Create a new Payment for the renewal
    new_payment = Payment(
        payment_id=payment_entity["id"],
        user_id=db_subscription.user_id,
        plan_id=db_subscription.plan_id,
        amount=payment_entity["amount"] / 100,  # Convert from paise
        currency=payment_entity["currency"],
        status="captured",
        gateway_payment_id=payment_entity["id"],
        gateway_order_id=payment_entity.get("order_id"),
        gateway_signature=payment_entity.get("signature"),
        transaction_timestamp=datetime.fromtimestamp(
            payment_entity["created_at"], tz=timezone.utc
        ),
    )
    db.add(new_payment)

    # Update subscription dates
    db_subscription.start_date = datetime.fromtimestamp(
        subscription_entity["start_at"], tz=timezone.utc
    ).date()
    db_subscription.end_date = datetime.fromtimestamp(
        subscription_entity["end_at"], tz=timezone.utc
    ).date()
    db.add(db_subscription)

    # Log event
    event = PaymentEvent(
        user_id=db_subscription.user_id,
        payment_id=new_payment.payment_id,
        subscription_id=razorpay_subscription_id,
        event_type="subscription.charged",
        event_description=f"Subscription {razorpay_subscription_id} charged successfully.",
    )
    db.add(event)
    db.commit()
    print(
        f"[WEBHOOK] subscription.charged: Processed for subscription {razorpay_subscription_id}"
    )


def handle_subscription_status_change(event_type: str, payload: dict, db: Session):
    subscription_entity = safe_get(payload, "subscription", "entity") or {}
    razorpay_subscription_id = subscription_entity.get("id")

    db_subscription = db.exec(
        select(Subscription).where(
            Subscription.razorpay_subscription_id == razorpay_subscription_id
        )
    ).first()
    if not db_subscription:
        print(f"[WEBHOOK] ERROR: Subscription {razorpay_subscription_id} not found.")
        return

    new_status = {
        "subscription.cancelled": "cancelled",
        "subscription.paused": "paused",
        "subscription.resumed": "active",
    }.get(event_type) or "unknown"

    db_subscription.status = new_status
    if new_status == "cancelled":
        db_subscription.cancelled_at = datetime.now(timezone.utc)

    db.add(db_subscription)
    event = PaymentEvent(
        user_id=db_subscription.user_id,
        subscription_id=razorpay_subscription_id,
        event_type=event_type,
        event_description=f"Subscription status changed to {new_status}",
    )
    db.add(event)
    db.commit()
    print(
        f"[WEBHOOK] {event_type}: Processed for subscription {razorpay_subscription_id}"
    )


def handle_payment_failed(payload: dict, db: Session):
    payment_entity = safe_get(payload, "payment", "entity") or {}
    notes = payment_entity.get("notes", {})
    app_payment_id = notes.get("app_payment_id")

    if not app_payment_id:
        print("[WEBHOOK] ERROR: app_payment_id not in payment notes for payment.failed")
        return

    db_payment = db.exec(
        select(Payment).where(Payment.payment_id == app_payment_id)
    ).first()
    if not db_payment:
        print(f"[WEBHOOK] ERROR: Payment record with ID {app_payment_id} not found.")
        return

    db_payment.status = "failed"
    db_payment.gateway_response_code = payment_entity.get("error_code")
    db_payment.gateway_response_message = payment_entity.get("error_description")
    db.add(db_payment)

    event = PaymentEvent(
        user_id=db_payment.user_id,
        payment_id=db_payment.payment_id,
        subscription_id=payment_entity.get("subscription_id"),
        event_type="payment.failed",
        event_description=f"Payment failed: {payment_entity.get('error_description')}",
        error_code=payment_entity.get("error_code"),
        error_details=payment_entity.get("error_reason"),
    )
    db.add(event)
    db.commit()
    print(f"[WEBHOOK] payment.failed: Processed for payment {app_payment_id}")


def handle_unhandled_event(event_type: str, payload: dict, db: Session):
    print(f"[WEBHOOK] UNHANDLED EVENT: {event_type}")
    print(f"[WEBHOOK] Full payload: {json.dumps(payload, indent=2)}")
    notes = safe_get(payload, "payment", "entity", "notes") or {}
    user_id = notes.get("app_user_id") if notes else "unknown"

    event = PaymentEvent(
        user_id=user_id,
        event_type=f"unhandled.{event_type}",
        event_description=f"An unhandled webhook event of type {event_type} was received.",
    )
    db.add(event)
    db.commit()


EVENT_HANDLERS = {
    "subscription.activated": handle_subscription_activated,
    "subscription.charged": handle_subscription_charged,
    "subscription.cancelled": lambda p, d: handle_subscription_status_change(
        "subscription.cancelled", p, d
    ),
    "subscription.paused": lambda p, d: handle_subscription_status_change(
        "subscription.paused", p, d
    ),
    "subscription.resumed": lambda p, d: handle_subscription_status_change(
        "subscription.resumed", p, d
    ),
    "payment.failed": handle_payment_failed,
}
