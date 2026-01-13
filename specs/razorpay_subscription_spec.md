# Razorpay Subscription Integration Specification

## Overview
Replace Lemon Squeezy with Razorpay for subscription-based payments in WikiVoice TTS SaaS application. The integration will support monthly subscription plans with upgrade capabilities, proration handling, and webhook-based subscription management.

## Goals
1. Implement Razorpay subscription checkout flow using checkout.js
2. Handle subscription upgrades with proration
3. Manage subscription lifecycle via webhooks
4. Track character usage per subscription tier
5. Support failed payment retry handling
6. Remove all Lemon Squeezy code and references

## Non-Goals
- Support refunds (explicitly out of scope)
- Support subscription cancellation (users can only upgrade or churn)
- Downgrade functionality (only upgrades allowed)
- Legacy migration from Lemon Squeezy (fresh start)
- International pricing (USD only initially)

## Functional Requirements

### 1. Subscription Plans
- **Explorer (Free)**: 500 characters/month, no payment required
- **Creator ($5/month)**: 250,000 characters/month, Razorpay plan required
- **Professional ($12/month)**: 1,000,000 characters/month, Razorpay plan required

### 2. Checkout Flow
1. User selects subscription tier on pricing page
2. Frontend calls backend to create Razorpay subscription link
3. Backend returns subscription link with checkout_id
4. Frontend initializes Razorpay checkout.js with subscription mode
5. User completes payment on Razorpay hosted checkout
6. Razorpay redirects user to success URL
7. Webhook triggers subscription activation

### 3. Subscription Upgrades
1. User initiates upgrade from current plan to higher tier
2. Backend creates Razorpay subscription link with proration
3. Razorpay calculates prorated amount (credit for unused current period)
4. User pays only the difference
5. Subscription updated immediately upon payment
6. Character limit updates immediately

### 4. Character Usage Tracking
1. Track monthly characters used per user
2. Reset usage on plan change or new billing cycle
3. Enforce limits based on current plan
4. Notify user when approaching limit (80% threshold)

### 5. Failed Payment Handling
1. Detect failed payments via webhooks
2. Update subscription status to `past_due`
3. Restrict access to premium features
4. Send notification to user
5. Allow user to retry payment via portal
6. Expire subscription immediately when payment fails (0-day grace period)

### 6. Webhook Handling
- Verify webhook signature using HMAC-SHA256
- Handle events: subscription_created, subscription_activated, subscription_upgraded, payment_failed, subscription_paused, subscription_cancelled
- Update database atomically
- Return 200 OK for processed events

## Non-Functional Requirements

### Performance
- Webhook response time: < 500ms
- Checkout link generation: < 200ms
- Database queries for subscription status: < 50ms

### Security
- Verify all webhook signatures
- Use HTTPS for all API endpoints
- Never expose Razorpay key secret
- Validate user ownership for all subscription operations
- Rate limit webhook endpoints

### Reliability
- Idempotent webhook processing
- Retry webhook delivery (Razorpay retries up to 3 times)
- Database transactions for subscription updates
- Logging for all payment events

### Scalability
- Support concurrent webhook processing
- Database indexes on user_id and subscription_id
- Connection pooling for database

## Inputs

### Environment Variables
```bash
# Razorpay Configuration
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxxxxx
RAZORPAY_WEBHOOK_SECRET=my twanda girl

# Razorpay Plan IDs
RAZORPAY_CREATOR_PLAN_ID=plan_S32tseOHQyRQX7
RAZORPAY_PROFESSIONAL_PLAN_ID=plan_S32ufWUGQ3YHFEPRO

# Razorpay Subscription IDs
RAZORPAY_CREATOR_SUB_ID=sub_S339bKeWNzdVQ4
RAZORPAY_PROFESSIONAL_SUB_ID=sub_S33A7ayxmyypTP

# Application Configuration
DATABASE_URL=postgresql://user:pass@localhost:5432/wikivoice
FRONTEND_URL=http://localhost:5173
```

### Frontend Inputs
- Selected plan ID (creator or professional)
- User ID (from Clerk)
- Checkout callbacks (success, failure, close)

### Webhook Inputs
- Razorpay webhook signature header
- Raw webhook payload
- Event type and metadata

## Outputs

### API Endpoints
```
POST /api/subscription/checkout - Create Razorpay checkout link
POST /api/subscription/upgrade - Create upgrade checkout link with proration
POST /api/subscription/webhook - Handle Razorpay webhooks
GET /api/subscription/status - Get current subscription status
GET /api/subscription/usage - Get character usage statistics
GET /api/subscription/retry-payment - Get payment retry link for failed payments
```

### Database Models
- UserSubscription table with Razorpay identifiers
- Subscription event log for audit trail

### Frontend Integration
- Razorpay checkout.js initialization
- Success/failure callbacks
- Upgrade flow integration

### Error Responses
```json
{
  "error": "subscription_not_found",
  "message": "No active subscription found"
}
```

## Edge Cases

### Payment Failure During Checkout
- Display error message to user
- Do not create/update subscription in database
- Log error for support

### Webhook Processing Failure
- Return 500 to trigger Razorpay retry
- Log full error details
- Implement dead letter queue if needed

### Proration Calculation Issues
- Use Razorpay's proration preview endpoint
- Validate proration amount before creating link
- Handle edge cases (first month, partial periods)

### Concurrent Webhook Events
- Use database transactions
- Implement optimistic locking
- Idempotency key for each event

### User Authentication Issues
- Validate Clerk token on all endpoints
- Return 401 for missing/invalid tokens
- Map Clerk user_id to subscription

### Subscription Expiry During Usage
- Check subscription status on every API call
- 0-day grace period - immediate access revocation on payment failure
- User can retry payment to restore access

## Dependencies

### External Services
- Razorpay API (payments, subscriptions, webhooks)
- Clerk (authentication)
- PostgreSQL (database)
- Redis (caching, optional)

### Python Libraries
- `razorpay` (official SDK)
- `fastapi` (web framework)
- `sqlmodel` (ORM)
- `httpx` (HTTP client)
- `python-jose` (JWT validation)

### Internal Modules
- `src.api.deps` (Clerk authentication)
- `src.api.schema` (Database models)
- `src.api.utils` (Usage tracking)

## Data Model

### UserSubscription
```python
class UserSubscription(SQLModel, table=True):
    user_id: str = Field(primary_key=True)  # Clerk User ID
    
    # Razorpay Identifiers
    customer_id: str = Field(index=True, nullable=True)
    subscription_id: str = Field(index=True, nullable=True)
    plan_id: str = Field(index=True)  # explorer, creator, professional
    
    # Status Tracking
    status: str = Field(default="active")  # active, past_due, cancelled, expired
    current_period_start: Optional[datetime] = Field(nullable=True)
    current_period_end: Optional[datetime] = Field(nullable=True)
    
    # Usage Tracking
    monthly_char_used: int = Field(default=0)
    last_usage_reset_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Payment Retry
    retry_payment_link_id: Optional[str] = Field(nullable=True)
    failed_payment_count: int = Field(default=0)
```

### SubscriptionEvent (Audit Log)
```python
class SubscriptionEvent(SQLModel, table=True):
    id: int = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)
    subscription_id: str = Field(index=True)
    event_type: str  # created, upgraded, failed, expired, etc.
    event_data: dict  # Full event payload
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

## API Contract

### POST /api/subscription/checkout
**Request:**
```json
{
  "plan_id": "creator"  // or "professional"
}
```

**Response:**
```json
{
  "checkout_id": "pay_xxxxxxxx",
  "subscription_id": "sub_xxxxxxxx",
  "razorpay_key_id": "rzp_test_xxxxx"
}
```

### POST /api/subscription/upgrade
**Request:**
```json
{
  "new_plan_id": "professional"
}
```

**Response:**
```json
{
  "checkout_id": "pay_xxxxxxxx",
  "proration_amount": 700,  // in paise (₹7.00)
  "subscription_id": "sub_xxxxxxxx",
  "razorpay_key_id": "rzp_test_xxxxx"
}
```

### POST /api/subscription/webhook
**Headers:**
- `X-Razorpay-Signature`: webhook signature

**Request Body:** Razorpay webhook payload

**Response:** 200 OK

### GET /api/subscription/status
**Response:**
```json
{
  "plan_id": "creator",
  "plan_name": "Creator",
  "status": "active",
  "monthly_char_limit": 250000,
  "monthly_char_used": 45000,
  "current_period_end": "2026-02-12T00:00:00Z"
}
```

### GET /api/subscription/usage
**Response:**
```json
{
  "monthly_char_used": 45000,
  "monthly_char_limit": 250000,
  "percentage_used": 18,
  "remaining_characters": 205000
}
```

## Security Considerations

### Webhook Security
- Verify `X-Razorpay-Signature` header using HMAC-SHA256
- Reject requests without valid signature
- Log all verification failures
- Use webhook secret from environment variable

### API Security
- Require Clerk authentication on all endpoints
- Validate user owns the subscription being accessed
- Rate limit checkout and webhook endpoints
- Use HTTPS in production

### Data Protection
- Never log full webhook payloads (contains payment info)
- Mask customer_id in logs
- Encrypt sensitive configuration
- Follow PCI DSS compliance (Razorpay handles card data)

### Abuse Prevention
- Idempotency keys for checkout creation
- Prevent duplicate subscription creation
- Validate plan_id against allowed values
- Limit retry attempts for failed payments

## Open Questions

All questions resolved:
1. ✅ Razorpay plan IDs configured: Creator (plan_S32tseOHQyRQX7), Professional (plan_S32ufWUGQ3YHFEPRO)
2. ✅ Grace period: 0 days (immediate expiry on payment failure)
3. ✅ Webhook secret configured

## Acceptance Criteria

1. ✅ Users can subscribe to Creator or Professional plans via Razorpay
2. ✅ Users can upgrade between plans with proration applied
3. ✅ Webhook signature verification is implemented and tested
4. ✅ Failed payments are detected and subscription expires immediately (0-day grace period)
5. ✅ Character usage limits are enforced per plan
6. ✅ All Lemon Squeezy code is removed from codebase
7. ✅ Frontend checkout integration works with Razorpay checkout.js
8. ✅ Subscription status API returns correct data
9. ✅ Usage tracking resets correctly on plan changes
10. ✅ Database schema updated for Razorpay identifiers
11. ✅ Environment variables documented
12. ✅ Unit tests for webhook handling (80%+ coverage)
13. ✅ Integration tests for checkout flow
14. ✅ Error messages are user-friendly
15. ✅ Security audit passed for webhook endpoints
