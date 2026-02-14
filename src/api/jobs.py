"""
Background jobs for token management using Dramatiq.
These jobs handle monthly token resets and other scheduled tasks.
"""

import logging
from datetime import datetime, timezone, timedelta

import dramatiq
from sqlmodel import Session, select

from src.api.schema import User, Subscription, Plan
from src.api.token_utils import reset_user_tokens
from src.api.utils import get_session, engine

logger = logging.getLogger(__name__)


@dramatiq.actor
def monthly_token_reset():
    """
    Monthly job to reset tokens for all active subscribers.
    Resets tokens_remaining to tokens_allocated and monthly_tokens_used to 0.
    Runs automatically each month via Dramatiq scheduler.
    """
    logger.info("[MONTHLY_RESET] Starting monthly token reset job")

    try:
        with Session(engine) as session:
            # Get all users who have active subscriptions
            active_subs = session.exec(
                select(Subscription).where(Subscription.status == "active")
            ).all()

            reset_count = 0
            skipped_count = 0
            error_count = 0

            for subscription in active_subs:
                try:
                    user = session.exec(
                        select(User).where(User.user_id == subscription.user_id)
                    ).first()

                    if not user:
                        logger.warning(
                            f"[MONTHLY_RESET] User {subscription.user_id} not found, skipping"
                        )
                        skipped_count += 1
                        continue

                    # Check if it's time for reset (30 days since last reset)
                    should_reset = True
                    if user.last_reset_date:
                        days_since_reset = (
                            datetime.now(timezone.utc) - user.last_reset_date
                        ).days
                        if days_since_reset < 30:
                            logger.info(
                                f"[MONTHLY_RESET] Skipping user {user.user_id} - "
                                f"only {days_since_reset} days since last reset"
                            )
                            should_reset = False
                            skipped_count += 1
                            continue

                    if should_reset:
                        # Get the plan's token limit
                        plan = session.exec(
                            select(Plan).where(Plan.plan_id == subscription.plan_id)
                        ).first()

                        if plan:
                            success = reset_user_tokens(
                                session=session,
                                user_id=user.user_id,
                                new_token_limit=plan.token_limit,
                                reason="monthly_reset",
                            )

                            if success:
                                logger.info(
                                    f"[MONTHLY_RESET] Reset tokens for user {user.user_id} "
                                    f"to {plan.token_limit} (plan: {plan.name})"
                                )
                                reset_count += 1
                            else:
                                logger.error(
                                    f"[MONTHLY_RESET] Failed to reset tokens for user {user.user_id}"
                                )
                                error_count += 1
                        else:
                            logger.warning(
                                f"[MONTHLY_RESET] Plan {subscription.plan_id} not found "
                                f"for user {user.user_id}"
                            )
                            skipped_count += 1

                except Exception as e:
                    logger.error(
                        f"[MONTHLY_RESET] Error processing subscription "
                        f"{subscription.razorpay_subscription_id}: {e}"
                    )
                    error_count += 1
                    continue

            logger.info(
                f"[MONTHLY_RESET] Job completed: {reset_count} reset, "
                f"{skipped_count} skipped, {error_count} errors"
            )

    except Exception as e:
        logger.error(f"[MONTHLY_RESET] Critical error in monthly reset job: {e}")


@dramatiq.actor
def check_expired_subscriptions():
    """
    Check for expired subscriptions and reset tokens to Explorer plan.
    This is a safety net in case webhooks fail.
    """
    logger.info("[EXPIRY_CHECK] Starting subscription expiry check")

    try:
        with Session(engine) as session:
            # Find expired subscriptions
            expired_subs = session.exec(
                select(Subscription).where(Subscription.status == "expired")
            ).all()

            processed_count = 0

            # Get Explorer plan token limit
            explorer_plan = session.exec(
                select(Plan).where(Plan.name == "explorer")
            ).first()

            if not explorer_plan:
                logger.error("[EXPIRY_CHECK] Explorer plan not found in database")
                return

            for subscription in expired_subs:
                try:
                    user = session.exec(
                        select(User).where(User.user_id == subscription.user_id)
                    ).first()

                    if user and user.tokens_allocated != explorer_plan.token_limit:
                        # User has expired sub but tokens not reset yet
                        reset_user_tokens(
                            session=session,
                            user_id=user.user_id,
                            new_token_limit=explorer_plan.token_limit,
                            reason="subscription_expired_cleanup",
                        )
                        logger.info(
                            f"[EXPIRY_CHECK] Reset tokens for expired user {user.user_id} "
                            f"to Explorer limit ({explorer_plan.token_limit})"
                        )
                        processed_count += 1

                except Exception as e:
                    logger.error(
                        f"[EXPIRY_CHECK] Error processing expired subscription "
                        f"{subscription.razorpay_subscription_id}: {e}"
                    )
                    continue

            logger.info(f"[EXPIRY_CHECK] Completed: {processed_count} users processed")

    except Exception as e:
        logger.error(f"[EXPIRY_CHECK] Critical error in expiry check: {e}")


def schedule_monthly_reset():
    """
    Schedule the monthly reset job to run on the 1st of each month at midnight UTC.
    This should be called during application startup.
    """
    from dramatiq.middleware import CurrentMessage

    # Calculate next run time (1st of next month at midnight UTC)
    now = datetime.now(timezone.utc)
    if now.day == 1:
        # If today is the 1st, schedule for next month
        next_run = (now.replace(day=1) + timedelta(days=32)).replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
    else:
        # Schedule for 1st of this month or next
        next_run = (now.replace(day=1) + timedelta(days=32)).replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )

    # Enqueue the job with delay
    delay_ms = int((next_run - now).total_seconds() * 1000)
    monthly_token_reset.send_with_options(delay=delay_ms)

    logger.info(
        f"[SCHEDULER] Monthly reset scheduled for {next_run} (delay: {delay_ms}ms)"
    )


def schedule_daily_checks():
    """
    Schedule daily checks for expired subscriptions.
    Runs every day at 2 AM UTC.
    """
    from dramatiq.middleware import CurrentMessage

    now = datetime.now(timezone.utc)
    # Schedule for 2 AM tomorrow
    tomorrow_2am = (now + timedelta(days=1)).replace(
        hour=2, minute=0, second=0, microsecond=0
    )
    delay_ms = int((tomorrow_2am - now).total_seconds() * 1000)

    check_expired_subscriptions.send_with_options(delay=delay_ms)

    logger.info(
        f"[SCHEDULER] Daily expiry check scheduled for {tomorrow_2am} (delay: {delay_ms}ms)"
    )
