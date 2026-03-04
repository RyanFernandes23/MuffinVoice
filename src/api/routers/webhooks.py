import json
import hmac
import hashlib
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from fastapi import APIRouter, Request, HTTPException, Depends, status
from sqlmodel import Session, select

from svix.webhooks import Webhook, WebhookVerificationError

from ..config import settings
from ..utils import get_session
from ..schema import User, PaymentEvent, Plan, Notebook, Subscription, DeletedUser
from src.utils.payment_client import cancel_razorpay_subscription
from src.TTS_Workers.tasks import get_s3_client
from src.utils.RedisClient import redis_client

webhooks_router = APIRouter(
    prefix="/webhooks",
    tags=["Webhooks"],
)

webhook_secret = settings.clerk_webhook_secret


@webhooks_router.post("/clerk")
async def clerk_webhook(request: Request, db: Session = Depends(get_session)):
    try:
        # 1. Get the headers
        headers = request.headers
        svix_id = headers.get("svix-id")
        svix_timestamp = headers.get("svix-timestamp")
        svix_signature = headers.get("svix-signature")

        # 2. Get the request body
        webhook_body = await request.body()

        if not svix_id or not svix_timestamp or not svix_signature:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing Svix headers",
            )

        if not webhook_secret:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Clerk Webhook Secret is not configured.",
            )

        # 3. Verify the webhook signature
        wh = Webhook(webhook_secret)

        try:
            evt = wh.verify(webhook_body, headers)
        except WebhookVerificationError as e:
            print(f"Webhook verification failed: {e}")
            # Log the verification failure
            # Consider logging the raw body and headers (redacted sensitive info) for debugging
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Webhook verification failed",
            ) from e

        # 4. Process the webhook event
        event_type = evt["type"]
        data = evt["data"]

        print(f"Received Clerk webhook event: {event_type}")

        if event_type == "user.created":
            handle_user_created(data, db)
        elif event_type == "user.updated":
            handle_user_updated(data, db)
        elif event_type == "user.deleted":
            handle_user_deleted(data, db)
        else:
            print(f"Unhandled Clerk webhook event type: {event_type}")
            # Optionally log unhandled events to DB or monitoring system
            # log_payment_event(
            #     user_id="system",
            #     event_type=f"clerk.webhook.unhandled.{event_type}",
            #     event_description="Received unhandled Clerk webhook event",
            #     error_details={"event": evt},
            #     db=db
            # )

        return {"status": "success"}

    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Error processing Clerk webhook: {e}")
        # Log unexpected errors
        # log_payment_event(
        #     user_id="system",
        #     event_type="clerk.webhook.error",
        #     event_description=f"Unexpected error processing Clerk webhook: {str(e)}",
        #     error_details={"error": str(e), "request_body": webhook_body.decode(errors='ignore')},
        #     db=db
        # )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error processing webhook",
        )


def handle_user_created(user_data: Dict[str, Any], db: Session):
    clerk_user_id = user_data.get("id")
    email_addresses = user_data.get("email_addresses", [])
    primary_email = next(
        (
            e["email_address"]
            for e in email_addresses
            if e["id"] == user_data.get("primary_email_address_id")
        ),
        None,
    )

    username = user_data.get("username")
    if (
        not username and primary_email
    ):  # Fallback if username is not directly provided by Clerk for some reason
        username = (
            primary_email.split("@")[0] + "_" + clerk_user_id[-4:]
        )  # Generate unique username

    first_name = user_data.get("first_name", "")
    last_name = user_data.get("last_name", "")

    if not clerk_user_id or not primary_email or not username:
        print(
            f"Missing essential data for user.created webhook: ID={clerk_user_id}, Email={primary_email}, Username={username}"
        )
        # Log this as a critical error
        return

    # Check if email already exists (prevents duplicate email constraint violation)
    existing_email = db.exec(select(User).where(User.email == primary_email)).first()
    if existing_email:
        print(f"Email {primary_email} already exists, skipping creation.")
        return

    # Check if user already exists
    existing_user = db.exec(select(User).where(User.user_id == clerk_user_id)).first()
    if existing_user:
        print(f"User {clerk_user_id} already exists, skipping creation.")
        return

    # Check if this email was previously deleted (prevent token farming)
    deleted_user = db.exec(
        select(DeletedUser).where(DeletedUser.email == primary_email)
    ).first()

    # Get Explorer plan token limit for new users
    explorer_plan = db.exec(select(Plan).where(Plan.name == "explorer")).first()
    default_token_limit = explorer_plan.token_limit if explorer_plan else 40000

    # Determine tokens based on previous deletion record
    if deleted_user:
        if deleted_user.previous_plan == "explorer":
            # Explorer -> Explorer: restore old remaining tokens
            token_limit = deleted_user.tokens_remaining_at_deletion
        else:
            # Creator/Professional -> Explorer: give 40k tokens (they lost their paid sub)
            token_limit = default_token_limit
        # Delete the DeletedUser record after processing
        db.delete(deleted_user)
        print(
            f"Restored {token_limit} tokens for re-registered user (previous plan: {deleted_user.previous_plan})"
        )
    else:
        # New user: give default explorer tokens
        token_limit = default_token_limit

    try:
        new_user = User(
            user_id=clerk_user_id,
            username=username,
            email=primary_email,
            # password_hash is not handled by Clerk directly for external apps,
            # so it can be None or a dummy value.
            password_hash=None,
            tokens_remaining=token_limit,
            tokens_allocated=token_limit,
            # You might want to store first_name, last_name if your User model supports it
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        print(
            f"User {clerk_user_id} created successfully in DB with {token_limit} tokens."
        )
    except Exception as e:
        db.rollback()
        print(f"Error creating user {clerk_user_id} in DB: {e}")
        # Log this error


def handle_user_updated(user_data: Dict[str, Any], db: Session):
    clerk_user_id = user_data.get("id")
    email_addresses = user_data.get("email_addresses", [])
    primary_email = next(
        (
            e["email_address"]
            for e in email_addresses
            if e["id"] == user_data.get("primary_email_address_id")
        ),
        None,
    )
    username = user_data.get("username")

    if not clerk_user_id:
        print("Missing user ID for user.updated webhook.")
        # Log this error
        return

    existing_user = db.exec(select(User).where(User.user_id == clerk_user_id)).first()
    if not existing_user:
        print(f"User {clerk_user_id} not found for update, attempting to create.")
        # Fallback to creation if not found (though user.created should handle this)
        handle_user_created(user_data, db)
        return

    updated = False
    if primary_email and existing_user.email != primary_email:
        existing_user.email = primary_email
        updated = True
    if username and existing_user.username != username:
        # Ensure username uniqueness before updating
        if db.exec(
            select(User).where(User.username == username, User.user_id != clerk_user_id)
        ).first():
            print(
                f"Cannot update user {clerk_user_id}: username '{username}' already taken."
            )
            # Log this as a warning/error
        else:
            existing_user.username = username
            updated = True

    # Update other fields like first_name, last_name if they are in your User model
    # if "first_name" in user_data and existing_user.first_name != user_data["first_name"]:
    #     existing_user.first_name = user_data["first_name"]
    #     updated = True

    if updated:
        try:
            db.add(existing_user)
            db.commit()
            db.refresh(existing_user)
            print(f"User {clerk_user_id} updated successfully in DB.")
        except Exception as e:
            db.rollback()
            print(f"Error updating user {clerk_user_id} in DB: {e}")
            # Log this error
    else:
        print(f"No changes detected for user {clerk_user_id}, skipping update.")


def handle_user_deleted(user_data: Dict[str, Any], db: Session):
    """
    Handle user deletion from Clerk.
    - Cancels active subscriptions in Razorpay (no refund)
    - Deletes all notebooks and notes
    - Soft deletes user with anonymization
    """
    clerk_user_id = user_data.get("id")
    if not clerk_user_id:
        print("Missing user ID for user.deleted webhook.")
        return

    user = db.exec(select(User).where(User.user_id == clerk_user_id)).first()
    if not user:
        print(f"User {clerk_user_id} not found for deletion.")
        return

    # Determine previous plan and save to DeletedUser table
    active_sub = db.exec(
        select(Subscription).where(
            Subscription.user_id == clerk_user_id, Subscription.status == "active"
        )
    ).first()

    previous_plan = "explorer"
    razorpay_sub_id = None
    if active_sub:
        plan = db.exec(select(Plan).where(Plan.plan_id == active_sub.plan_id)).first()
        if plan:
            previous_plan = plan.name
        razorpay_sub_id = active_sub.razorpay_subscription_id

    # Save to DeletedUser table for token restoration logic
    deleted_user_record = DeletedUser(
        email=user.email,
        previous_plan=previous_plan,
        tokens_remaining_at_deletion=user.tokens_remaining,
        razorpay_subscription_id=razorpay_sub_id,
    )
    db.add(deleted_user_record)

    # Cancel active subscriptions in Razorpay (no refund)
    active_subs = db.exec(
        select(Subscription).where(
            Subscription.user_id == clerk_user_id, Subscription.status == "active"
        )
    ).all()

    for sub in active_subs:
        try:
            cancel_razorpay_subscription(sub.razorpay_subscription_id)
            print(f"Cancelled Razorpay subscription: {sub.razorpay_subscription_id}")
        except Exception as e:
            print(f"Error cancelling subscription {sub.razorpay_subscription_id}: {e}")
        sub.status = "cancelled"
        sub.cancelled_at = datetime.now(timezone.utc)

    # Delete notebooks (notes auto-delete via CASCADE)
    notebooks = db.exec(select(Notebook).where(Notebook.user_id == clerk_user_id)).all()

    # Delete all S3 files for the user (entire user folder)
    s3 = get_s3_client()
    try:
        s3_prefix = f"{user.user_id}/"
        response = s3.list_objects_v2(Bucket="ttsfiles", Prefix=s3_prefix)
        if "Contents" in response:
            objects_to_delete = [{"Key": obj["Key"]} for obj in response["Contents"]]
            s3.delete_objects(Bucket="ttsfiles", Delete={"Objects": objects_to_delete})
            print(
                f"Deleted {len(objects_to_delete)} S3 objects for user {user.user_id}"
            )
    except Exception as e:
        print(f"Error deleting S3 objects for user {user.user_id}: {e}")

    # Delete Redis keys for each notebook
    for nb in notebooks:
        try:
            redis_client.delete(f"job:{nb.job_id}")
        except Exception as e:
            print(f"Error deleting Redis key for job {nb.job_id}: {e}")

    # Delete notebooks from database
    for nb in notebooks:
        db.delete(nb)
    print(f"Deleted {len(notebooks)} notebooks for user {clerk_user_id}")

    # Soft delete user - anonymize
    user.deleted_at = datetime.now(timezone.utc)
    user.email = f"deleted_{clerk_user_id[:8]}@avenreader.local"
    user.username = f"deleted_{clerk_user_id[:8]}"

    db.commit()
    print(f"User {clerk_user_id} soft deleted and anonymized.")


# Helper to log events if PaymentEvent is intended for general logging
def log_payment_event(
    user_id: str,
    event_type: str,
    event_description: str,
    error_details: Optional[Dict] = None,
    db: Session = Depends(get_session),
):
    event = PaymentEvent(
        user_id=user_id,
        event_type=event_type,
        event_description=event_description,
        error_details=error_details,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
