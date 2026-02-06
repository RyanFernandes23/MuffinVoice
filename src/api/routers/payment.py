import razorpay
import hmac
import hashlib
import json
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from ..config import settings

router = APIRouter(
    prefix="/payment",
    tags=["Payment"],
)

client = razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))


class SubscriptionRequest(BaseModel):
    plan_name: str


class WebhookRequest(BaseModel):
    event: str
    payload: dict


def verify_razorpay_signature(payload: str, signature: str) -> bool:
    secret = settings.razorpay_webhook_secret
    expected_signature = hmac.new(
        secret.encode(), payload.encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected_signature, signature)


@router.post("/create-subscription")
async def create_subscription(request: SubscriptionRequest):
    """
    Create a subscription on Razorpay and return the subscription_id.
    """
    try:
        plan_id_map = {
            "creator": settings.razorpay_creator_plan_id,
            "professional": settings.razorpay_professional_plan_id,
        }

        razorpay_plan_id = plan_id_map.get(request.plan_name.lower())

        if not razorpay_plan_id:
            raise HTTPException(
                status_code=400, detail=f"Invalid plan name: {request.plan_name}"
            )

        subscription_data = {
            "plan_id": razorpay_plan_id,
            "total_count": 12,
            "quantity": 1,
        }
        subscription = client.subscription.create(data=subscription_data)
        return {
            "subscription_id": subscription["id"],
            "key_id": settings.razorpay_key_id,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/webhook")
async def razorpay_webhook(request: Request, response: Response):
    try:
        raw_body = await request.body()
        signature = request.headers.get("x-razorpay-signature")

        if not signature:
            raise HTTPException(status_code=400, detail="Missing signature")

        if not verify_razorpay_signature(raw_body.decode(), signature):
            raise HTTPException(status_code=400, detail="Invalid signature")

        event = json.loads(raw_body)
        event_type = event.get("event")
        payload = event.get("payload", {})

        print(f"[WEBHOOK] Received event: {event_type}")

        if event_type == "payment.authorized":
            entity = payload.get("payment", {}).get("entity", {})
            payment_id = entity.get("id")
            amount = entity.get("amount")
            order_id = entity.get("order_id")

            print(
                f"[WEBHOOK] payment.authorized: payment_id={payment_id}, amount={amount}, order_id={order_id}"
            )

        elif event_type == "payment.captured":
            entity = payload.get("payment", {}).get("entity", {})
            payment_id = entity.get("id")
            amount = entity.get("amount")

            print(
                f"[WEBHOOK] payment.captured: payment_id={payment_id}, amount={amount}"
            )

        elif event_type == "order.paid":
            entity = payload.get("order", {}).get("entity", {})
            order_id = entity.get("id")
            payment_id = payload.get("payment", {}).get("entity", {}).get("id")

            print(f"[WEBHOOK] order.paid: order_id={order_id}, payment_id={payment_id}")

        elif event_type == "subscription.authenticated":
            entity = payload.get("subscription", {}).get("entity", {})
            subscription_id = entity.get("id")

            print(
                f"[WEBHOOK] subscription.authenticated: subscription_id={subscription_id}"
            )

        elif event_type == "subscription.activated":
            entity = payload.get("subscription", {}).get("entity", {})
            subscription_id = entity.get("id")
            customer_id = entity.get("customer_id")
            plan_id = entity.get("plan_id")

            print(
                f"[WEBHOOK] subscription.activated: subscription_id={subscription_id}, customer_id={customer_id}, plan_id={plan_id}"
            )

        elif event_type == "subscription.charged":
            entity = payload.get("payment", {}).get("entity", {})
            payment_id = entity.get("id")
            amount = entity.get("amount")
            subscription_id = (
                payload.get("subscription", {}).get("entity", {}).get("id")
            )

            print(
                f"[WEBHOOK] subscription.charged: payment_id={payment_id}, amount={amount}, subscription_id={subscription_id}"
            )

        elif event_type == "subscription.paused":
            entity = payload.get("subscription", {}).get("entity", {})
            subscription_id = entity.get("id")

            print(f"[WEBHOOK] subscription.paused: subscription_id={subscription_id}")

        elif event_type == "subscription.resumed":
            entity = payload.get("subscription", {}).get("entity", {})
            subscription_id = entity.get("id")

            print(f"[WEBHOOK] subscription.resumed: subscription_id={subscription_id}")

        elif event_type == "subscription.cancelled":
            entity = payload.get("subscription", {}).get("entity", {})
            subscription_id = entity.get("id")

            print(
                f"[WEBHOOK] subscription.cancelled: subscription_id={subscription_id}"
            )

        elif event_type == "payment.failed":
            entity = payload.get("payment", {}).get("entity", {})
            payment_id = entity.get("id")
            error_code = entity.get("error_code")
            error_description = entity.get("error_description")

            print(
                f"[WEBHOOK] payment.failed: payment_id={payment_id}, error_code={error_code}, error_description={error_description}"
            )

        else:
            print(f"[WEBHOOK] UNHANDLED EVENT: {event_type}")
            print(f"[WEBHOOK] Full payload: {json.dumps(payload, indent=2)}")

        response.status_code = 200
        return {"status": "success"}

    except Exception as e:
        print(f"[WEBHOOK] Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
