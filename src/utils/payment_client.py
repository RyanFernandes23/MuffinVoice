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
