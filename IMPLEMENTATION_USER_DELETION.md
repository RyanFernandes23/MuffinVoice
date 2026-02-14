# User Deletion Implementation Plan

## Overview
Handle Clerk `user.deleted` webhook with soft delete + anonymization approach. Prevent token farming by tracking deleted users and restoring appropriate tokens on re-registration.

---

## Changes Required

### 1. Add `deleted_at` field to User model ✅ DONE
**File:** `src/api/schema.py`

Added field to User class:
```python
deleted_at: Optional[datetime] = Field(default=None)
```

### 2. Add Razorpay subscription cancellation function ✅ DONE
**File:** `src/utils/payment_client.py`

```python
def cancel_razorpay_subscription(subscription_id: str) -> dict:
    """Cancel a subscription in Razorpay (no refund)."""
    return razorpay_client.subscription.cancel(subscription_id)
```

### 3. Add DeletedUser table 📌 NEXT
**File:** `src/api/schema.py`

```python
class DeletedUser(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(max_length=255, index=True)
    deleted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    previous_plan: str = Field(max_length=50)  # explorer/creator/professional
    tokens_remaining_at_deletion: int = Field(default=0)
    razorpay_subscription_id: Optional[str] = Field(default=None, max_length=255)
```

### 4. Update handle_user_deleted function 📌 NEXT
**File:** `src/api/routers/webhooks.py`

- Save user info to `DeletedUser` table before anonymizing
- Include: email, previous_plan, tokens_remaining_at_deletion, razorpay_subscription_id

### 5. Update handle_user_created function 📌 NEXT
**File:** `src/api/routers/webhooks.py`

Check `DeletedUser` table and apply token restoration logic:
- **Explorer → Explorer**: Restore old remaining tokens
- **Creator/Professional → Explorer**: Give 40k tokens
- **No previous record**: Give 40k tokens
- Delete `DeletedUser` record after processing

---

## Token Restoration Logic

| Previous Plan | Current Plan (Explorer) | Tokens Allocated |
|--------------|------------------------|------------------|
| Explorer (exhausted) | Explorer | 0 tokens |
| Explorer (with remaining) | Explorer | Old remaining tokens |
| Creator | Explorer | 40k tokens |
| Professional | Explorer | 40k tokens |
| No previous record | Explorer | 40k tokens |

---

## Behavior Flow

### On User Deletion:
1. Clerk sends `user.deleted` webhook
2. Find user in database
3. Get active subscription to determine previous plan
4. Save to `DeletedUser` table: email, previous_plan, tokens_remaining, subscription_id
5. Cancel active subscriptions in Razorpay (no refund)
6. Delete all notebooks/notes
7. Soft delete user - anonymize email/username, set deleted_at

### On New Registration:
1. Clerk sends `user.created` webhook
2. Check if email exists in `DeletedUser` table
3. If found:
   - If previous_plan == "explorer" → use `tokens_remaining_at_deletion`
   - If previous_plan in ["creator", "professional"] → use 40k tokens
   - Delete the DeletedUser record
4. If not found → use 40k tokens
5. Create user with calculated tokens

---

## Notes
- No refund on cancellation (as per requirement)
- Payment history preserved for accounting
- Email/username anonymized to allow re-registration
- Prevents token farming by tracking deleted users
