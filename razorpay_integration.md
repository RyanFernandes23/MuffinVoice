# Integrating Razorpay Subscriptions with FastAPI

This document provides a step-by-step guide to integrating Razorpay's subscription-based payment system into a FastAPI application.

## Prerequisites

1.  **Razorpay Account:** You need an active Razorpay account. For testing, you can use the sandbox environment.
2.  **API Keys:** Get your `Key ID` and `Key Secret` from the Razorpay Dashboard under **Settings -> API Keys**.
3.  **Python and FastAPI:** A working FastAPI project environment.
4.  **Razorpay Python Library:** Install the official library.

    ```bash
    pip install razorpay
    ```

---

## The Integration Flow

The subscription process works in the following sequence:

1.  **Create a Plan:** You define a subscription plan (e.g., name, price, billing frequency) in your Razorpay dashboard.
2.  **Create a Subscription:** When a user decides to subscribe, your backend calls the Razorpay API to create a subscription for that user against a specific plan. Razorpay returns a `subscription_id`.
3.  **Frontend Checkout:** Your backend sends this `subscription_id` to the frontend. The frontend uses Razorpay's Checkout library to open the payment modal for the user to enter their payment details.
4.  **Handle Webhooks:** Once the user completes the initial payment, Razorpay sends a webhook to your backend to confirm the subscription is active. Razorpay will continue to send webhooks for all subsequent recurring charges. Your backend MUST verify these webhooks to update the user's subscription status in your database.

---

## Step 1: Configuration

Never hardcode your API keys. Use environment variables.

1.  Create a `.env` file in your project root:

    ```
    RAZORPAY_KEY_ID=your_key_id
    RAZORPAY_KEY_SECRET=your_key_secret
    RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
    ```
    *You can get the webhook secret after creating a webhook endpoint in the Razorpay dashboard.*

2.  Use a library like `pydantic-settings` to load these variables.

    ```bash
    pip install pydantic-settings
    ```

3.  Create a `config.py` file:

    ```python
    from pydantic_settings import BaseSettings

    class Settings(BaseSettings):
        razorpay_key_id: str
        razorpay_key_secret: str
        razorpay_webhook_secret: str

        class Config:
            env_file = ".env"

    settings = Settings()
    ```

---

## Step 2: Create a Subscription Plan

For simplicity, it is recommended to create your subscription plans directly from the **Razorpay Dashboard**.

1.  Go to **Subscriptions -> Plans**.
2.  Click **+ New Plan**.
3.  Fill in the details (Plan Name, Amount, Billing Frequency, etc.).
4.  Once created, copy the **Plan ID**. You will need this in your backend.

---

## Step 3: Backend - Create Subscription Endpoint

Create a new router in your FastAPI application to handle payments. This endpoint will be called by your frontend when a user clicks "Subscribe".

```python
# In your routers/payment.py

import razorpay
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from ..config import settings # Assuming you have a config file

router = APIRouter(
    prefix="/payment",
    tags=["Payment"],
)

# Initialize Razorpay client
client = razorpay.Client(
    auth=(settings.razorpay_key_id, settings.razorpay_key_secret)
)

class SubscriptionRequest(BaseModel):
    plan_id: str

@router.post("/create-subscription")
async def create_subscription(request: SubscriptionRequest):
    """
    Create a subscription on Razorpay and return the subscription_id.
    The frontend will use this to open the checkout modal.
    """
    try:
        # You can fetch plan_id from your DB or have it sent from frontend
        subscription_data = {
            "plan_id": request.plan_id,
            "total_count": 12,  # Number of billing cycles
            "quantity": 1,
            # You can add customer_notify, notes, etc.
        }
        subscription = client.subscription.create(subscription_data)
        return {"subscription_id": subscription["id"], "key_id": settings.razorpay_key_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

```

---

## Step 4: Frontend - Handle Checkout

Your frontend will call the `/payment/create-subscription` endpoint. On success, it will use the returned `subscription_id` to open the Razorpay Checkout form.

Here is a sample JavaScript snippet:

```javascript
// This is a conceptual example.

const handleSubscribe = async () => {
    // 1. Call your backend to create the subscription
    const response = await fetch('/payment/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: 'plan_xxxxxxxxxxxxxx' }) // Your plan_id
    });
    const data = await response.json();

    const { subscription_id, key_id } = data;

    // 2. Open Razorpay Checkout
    const options = {
        key: key_id,
        subscription_id: subscription_id,
        name: 'Your App Name',
        description: 'Subscription Purchase',
        handler: function (response) {
            // This function is called after a successful payment.
            // You can call another backend endpoint here to confirm the payment
            // and update your UI.
            alert('Payment Successful! Payment ID: ' + response.razorpay_payment_id);
            // It's safer to rely on webhooks for DB updates.
        },
        prefill: {
            name: 'Customer Name',
            email: 'customer@example.com',
        },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
};

// You need to include the Razorpay Checkout script in your HTML
// <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
```

---

## Step 5: Backend - Handle Webhooks

This is the most critical step for managing subscription status. Razorpay sends events to this endpoint when a payment is charged, a subscription is activated, or a payment fails.

1.  **Create the Webhook in Razorpay Dashboard:**
    *   Go to **Settings -> Webhooks**.
    *   Click **+ Add New Webhook**.
    *   Set the **Webhook URL** to `https://yourdomain.com/payment/webhook`.
    *   Enter the **Webhook Secret** you defined in your `.env` file.
    *   Select the events to listen to, especially `subscription.charged`.

2.  **Create the Webhook Endpoint in FastAPI:**

```python
# In your routers/payment.py, add this endpoint

@router.post("/webhook")
async def razorpay_webhook(request: Request):
    """
    Handle incoming webhooks from Razorpay.
    This endpoint verifies the signature and processes the event.
    """
    body = await request.body()
    try:
        # Verify the webhook signature
        signature = request.headers.get("x-razorpay-signature")
        client.utility.verify_webhook_signature(
            body.decode("utf-8"), signature, settings.razorpay_webhook_secret
        )

        # Decode the payload
        payload = body.decode("utf-8")
        event_data = json.loads(payload)
        event = event_data['event']

        # Handle the event
        if event == 'subscription.charged':
            # Payment was successful for a subscription renewal
            subscription_id = event_data['payload']['subscription']['entity']['id']
            payment_id = event_data['payload']['payment']['entity']['id']
            
            # --- YOUR BUSINESS LOGIC HERE ---
            # 1. Find the user associated with this subscription_id.
            # 2. Update their subscription expiry date in your database.
            # 3. Log the successful payment (payment_id).
            # Example: db.users.update_subscription(subscription_id, new_expiry)
            print(f"Subscription {subscription_id} charged successfully. Payment ID: {payment_id}")

        # You can handle other events like 'subscription.cancelled', 'payment.failed', etc.

        return {"status": "ok"}

    except razorpay.errors.SignatureVerificationError as e:
        raise HTTPException(status_code=400, detail="Invalid signature")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

```

This completes the basic integration of Razorpay subscriptions with a FastAPI backend. Remember to handle database logic and error cases gracefully.
