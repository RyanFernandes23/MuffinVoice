# Usage & Payment Flow Fixes Specification

## Overview
Fix three critical issues in the WikiVoice application:
1. Character usage counter doesn't update automatically after file processing completes
2. Razorpay upgrade flow shows "invalid" error in modal despite successful subscription
3. QR code option in payment modal causes full page refresh

## Goals
- Auto-update character usage display when notebook processing completes
- Fix Razorpay payment flow to use hosted checkout redirect properly
- Prevent page refresh when user interacts with payment options

## Non-Goals
- No changes to Razorpay webhook handler logic
- No changes to backend subscription models
- No changes to pricing tiers or character limits

## Functional Requirements

### 1. Auto-Update Character Usage (Critical)
**Location**: `my-app/app/dashboard/page.jsx`

**Requirement**:
- When any notebook status changes to "completed", automatically refresh the character usage display
- Usage refresh should happen without page reload
- Use existing `useUsage` hook's `refetch()` function

**Implementation**:
- Track notebook status changes in the polling loop (currently 5-second interval)
- When status transitions to "completed", call `useUsage.refetch()`
- Add `useUsage` hook import and refetch function call

### 2. Razorpay Hosted Checkout Redirect (Critical)
**Location**: `my-app/app/pricing/page.jsx`

**Requirement**:
- When upgrading subscription, redirect to Razorpay hosted checkout page
- Use the `short_url` returned from backend instead of opening modal
- Remove modal-based checkout that causes "invalid" error

**Implementation**:
- In `handleSubscribe`, check if `data.redirect_to` or `checkout_id` is a full URL
- Use `window.location.href` for redirect instead of `new window.Razorpay(options)`
- Preserve payment success callback with query parameter

### 3. QR Code Flow (Medium)
**Location**: `my-app/app/pricing/page.jsx`

**Requirement**:
- The hosted checkout (`short_url`) already supports QR code display
- User clicking on checkout link should see QR option without page refresh issues
- Redirect flow should preserve payment state

**Implementation**:
- Use `short_url` which is the hosted checkout with QR built-in
- Add payment_success query parameter handling in dashboard

## Inputs

### From Backend (Existing)
- `/api/subscription/checkout` returns:
  ```json
  {
    "subscription_id": "sub_xxx",
    "checkout_id": "https://razorpay.com/.../checkout/...",
    "razorpay_key_id": "key_xxx"
  }
  ```
- `/api/subscription/usage` returns usage data with `monthly_char_used` and `monthly_char_limit`

### From Frontend Components
- `usePlan()` hook provides current plan data
- `useUsage()` hook provides usage data with `refetch()` function
- Dashboard polling loop tracks notebook status changes

## Outputs

### Fixed Dashboard Behavior
- Usage bar updates automatically when file processing completes
- No manual page refresh required
- Visual feedback during usage refresh

### Fixed Payment Flow
- Clicking upgrade redirects to Razorpay hosted checkout
- Payment completion returns to dashboard with success message
- Subscription activated via webhook remains unchanged

## Edge Cases
1. User uploads file but closes dashboard before completion - usage will update on next visit
2. Payment interrupted - user can retry via existing retry-payment endpoint
3. Multiple uploads in progress - usage refresh should handle concurrent updates
4. Polling loop already checking status - add usage refresh alongside existing logic

## Dependencies
- Backend APIs: `/api/subscription/checkout`, `/api/subscription/usage`
- Frontend hooks: `usePlan`, `useUsage`
- Razorpay hosted checkout URL (`short_url`)
- Dashboard status polling (existing 5-second interval)

## Data Model (No Changes)
- UserSubscription model unchanged
- Character limit logic unchanged
- Usage tracking unchanged

## API Contract (No Changes)
- Existing endpoints remain unchanged
- Frontend integration changes only

## Security Considerations
- No authentication changes
- Payment flow uses existing Razorpay integration
- Redirect preserves authorization tokens

## Open Questions
None

## Acceptance Criteria
1. [ ] Character usage bar updates within 5 seconds of notebook reaching "completed" status
2. [ ] Clicking upgrade/subscribe on pricing page redirects to hosted checkout (no modal)
3. [ ] Payment completion returns to dashboard with `payment=success` query param
4. [ ] QR code option in Razorpay checkout works without page refresh issues
5. [ ] No console errors during payment flow
6. [ ] Existing webhook-based subscription activation continues to work

## Implementation Steps
1. Modify `dashboard/page.jsx` to import and use `useUsage` refetch on notebook completion
2. Modify `pricing/page.jsx` to use `short_url` redirect instead of modal
3. Add `payment=success` query parameter handling in dashboard
4. Test payment flow end-to-end
5. Verify usage auto-update behavior
