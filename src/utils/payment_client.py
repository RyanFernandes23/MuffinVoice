import logging
import os

from razorpay import Client

logger = logging.getLogger(__name__)

try:
    RAZORPAY_KEY_ID = os.environ["RAZORPAY_KEY_ID"]
    RAZORPAY_KEY_SECRET = os.environ["RAZORPAY_KEY_SECRET"]
except KeyError as e:
    logger.error("Razorpay API credentials not found in environment variables.")
    raise ValueError(f"Missing required environment variable: {e}")

razorpay_client = Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))


def cancel_razorpay_subscription(subscription_id: str) -> dict:
    """
    Cancel a Razorpay subscription immediately (no refund).

    Args:
        subscription_id: The Razorpay subscription ID to cancel

    Returns:
        dict: The cancelled subscription object from Razorpay

    Raises:
        Exception: If cancellation fails
    """
    # Type ignore for Razorpay SDK - subscription attribute exists at runtime
    return razorpay_client.subscription.cancel(subscription_id)  # type: ignore
