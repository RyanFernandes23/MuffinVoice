"""
Token management utilities - separate file to avoid circular imports.
This file should not import from other project modules to prevent circular dependencies.
"""

from datetime import datetime, timezone
from sqlmodel import Session, select

from src.api.schema import User, TokenUsageLog, Subscription, Plan


def calculate_text_tokens(text: str) -> int:
    """
    Calculate token count from text (character count).
    """
    return len(text)


def _log_token_action(
    session: Session,
    user_id: str,
    action: str,
    amount: int,
    balance_before: int,
    balance_after: int,
    notebook_id: str = None,
):
    """
    Internal function to log token actions to TokenUsageLog.
    """
    log = TokenUsageLog(
        user_id=user_id,
        notebook_id=notebook_id,
        action=action,
        amount=amount,
        balance_before=balance_before,
        balance_after=balance_after,
    )
    session.add(log)


def deduct_tokens(
    session: Session, user_id: str, amount: int, notebook_id: str = None
) -> bool:
    """
    Deduct tokens from user balance.
    Returns True if successful, False if insufficient tokens.
    Logs the action to TokenUsageLog.
    """
    user = session.exec(select(User).where(User.user_id == user_id)).first()
    if not user:
        print(f"[ERROR] Cannot deduct tokens - User {user_id} not found")
        return False

    if user.tokens_remaining < amount:
        print(
            f"[WARNING] Insufficient tokens for user {user_id}. "
            f"Required: {amount}, Available: {user.tokens_remaining}"
        )
        return False

    balance_before = user.tokens_remaining
    user.tokens_remaining -= amount
    user.monthly_tokens_used += amount

    _log_token_action(
        session,
        user_id,
        "deduct",
        amount,
        balance_before,
        user.tokens_remaining,
        notebook_id,
    )

    session.add(user)
    session.commit()

    print(
        f"[INFO] Deducted {amount} tokens from user {user_id}. "
        f"Balance: {balance_before} -> {user.tokens_remaining}"
    )
    return True


def refund_tokens(
    session: Session, user_id: str, amount: int, notebook_id: str = None
) -> bool:
    """
    Refund tokens to user (e.g., when TTS fails after deducting).
    Returns True if successful, False if user not found.
    Logs the action to TokenUsageLog.
    """
    user = session.exec(select(User).where(User.user_id == user_id)).first()
    if not user:
        print(f"[ERROR] Cannot refund tokens - User {user_id} not found")
        return False

    balance_before = user.tokens_remaining
    user.tokens_remaining += amount
    user.monthly_tokens_used -= amount

    # Ensure monthly_tokens_used doesn't go negative
    if user.monthly_tokens_used < 0:
        user.monthly_tokens_used = 0

    _log_token_action(
        session,
        user_id,
        "refund",
        amount,
        balance_before,
        user.tokens_remaining,
        notebook_id,
    )

    session.add(user)
    session.commit()

    print(
        f"[INFO] Refunded {amount} tokens to user {user_id}. "
        f"Balance: {balance_before} -> {user.tokens_remaining}"
    )
    return True


def reset_user_tokens(
    session: Session, user_id: str, new_token_limit: int, reason: str = "monthly_reset"
) -> bool:
    """
    Reset user tokens to new limit (for plan change or monthly reset).
    Sets tokens_remaining = new_token_limit, monthly_tokens_used = 0.
    Logs the action to TokenUsageLog.
    """
    user = session.exec(select(User).where(User.user_id == user_id)).first()
    if not user:
        print(f"[ERROR] Cannot reset tokens - User {user_id} not found")
        return False

    balance_before = user.tokens_remaining

    user.tokens_remaining = new_token_limit
    user.tokens_allocated = new_token_limit
    user.monthly_tokens_used = 0
    user.last_reset_date = datetime.now(timezone.utc)

    _log_token_action(
        session, user_id, reason, new_token_limit, balance_before, new_token_limit
    )

    session.add(user)
    session.commit()

    print(
        f"[INFO] Reset tokens for user {user_id} to {new_token_limit} (reason: {reason}). "
        f"Previous balance: {balance_before}"
    )
    return True


def check_token_availability(
    session: Session, user_id: str, required_tokens: int
) -> tuple[bool, int]:
    """
    Check if user has sufficient tokens.
    Returns (has_sufficient, available_tokens).
    """
    user = session.exec(select(User).where(User.user_id == user_id)).first()
    if not user:
        return False, 0

    return user.tokens_remaining >= required_tokens, user.tokens_remaining


def get_user_tokens(user_id: str, session: Session) -> dict:
    """
    Get current token status for user.
    Returns dict with remaining, allocated, used_this_month, percent_used, and plan_name.
    """
    user = session.exec(select(User).where(User.user_id == user_id)).first()
    if not user:
        raise ValueError(f"User {user_id} not found")

    # Get user's active subscription to determine plan name
    subscription = session.exec(
        select(Subscription).where(
            Subscription.user_id == user_id, Subscription.status == "active"
        )
    ).first()

    plan_name = "explorer"  # Default
    if subscription:
        plan = session.exec(
            select(Plan).where(Plan.plan_id == subscription.plan_id)
        ).first()
        if plan:
            plan_name = plan.name

    # Map plan name to max file size limit in MB
    plan_file_size_map = {
        "explorer": 50,
        "creator": 100,
        "professional": 150
    }
    max_file_size_mb = plan_file_size_map.get(plan_name.lower(), 50)

    percent_used = 0
    if user.tokens_allocated > 0:
        percent_used = (user.monthly_tokens_used / user.tokens_allocated) * 100

    return {
        "remaining": user.tokens_remaining,
        "allocated": user.tokens_allocated,
        "used_this_month": user.monthly_tokens_used,
        "percent_used": round(percent_used, 2),
        "plan_name": plan_name,
        "max_file_size_mb": max_file_size_mb,
    }
