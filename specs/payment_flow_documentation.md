# Payment Flow Documentation

This document outlines the current functionality of the "$5 upgrade button" (and other plan upgrade buttons) on the pricing page, and proposes future enhancements for a more robust subscription management system.

## 1. Current Functionality

When a user clicks on an upgrade button (e.g., the "$5 Creator Plan" button) on the `/pricing` page, the following sequence of events occurs:

### Frontend (`my-app/app/pricing/page.jsx`)

1.  **`handleSubscribeClick(planId)` is triggered.**
2.  **Authentication Check:**
    *   It checks if the user is signed in (`isSignedIn`).
    *   If `false`, a `toast.error('Please sign in to subscribe')` is displayed, and the user is redirected to `/sign-in`.
3.  **Existing Plan Check:**
    *   If `true`, it fetches the user's `planData` (using the `usePlan` hook, which internally uses `useUsage`).
    *   It defines a `planHierarchy` (`explorer: 0, creator: 1, professional: 2`).
    *   If the `selectedPlanLevel` (e.g., 'creator' is 1) is less than or equal to the `currentPlanLevel`, a `toast.error('You already have [Plan Name] plan or higher')` is displayed, and the process stops.
4.  **Open Payment Modal:**
    *   If the user is signed in and eligible to upgrade, the `selectedPlan` state is set to the chosen `planId` (e.g., 'creator').
    *   `setPaymentModalOpen(true)` is called, which renders the `PaymentModal` component.

### Frontend (`my-app/app/components/PaymentModal.jsx`)

1.  **Modal Appearance & Initial Setup:**
    *   The `PaymentModal` appears as an overlay.
    *   An `useEffect` hook (triggered by `isOpen` and `planName`) calls `handleCreateSubscription()`.
    *   The `processingStep` state is set to `'creating'`. The UI displays "Setting up your subscription..." with a spinner.
2.  **Create Razorpay Subscription (Backend Call):**
    *   `handleCreateSubscription()` calls `createSubscription(planName)` from the `usePayment` hook.
    *   `usePayment` makes an API request to the backend (inferred to be `/api/payments/create_subscription`) to create a Razorpay subscription.
3.  **Subscription Data Received:**
    *   If the backend call is successful, `subData` (containing Razorpay's `key_id` and `subscription_id`) is received.
    *   `setSubscriptionData(data)` updates the state.
    *   `setProcessingStep('ready')`. The UI displays "Ready to complete payment" with a "Proceed to Payment" button.
4.  **Load Razorpay Script & Open Gateway:**
    *   `loadRazorpayScript()` is called to ensure `checkout.js` is available.
    *   `startRazorpayPayment(subData)` is called, which initializes `window.Razorpay` with the received `subData`.
    *   `razorpay.open()` is invoked, opening the official Razorpay payment popup for the user to complete the transaction.
5.  **Payment Verification (Backend Call):**
    *   Upon successful completion of payment in the Razorpay popup, the `handler` callback within `startRazorpayPayment` is executed.
    *   This `handler` sends a `POST` request to the backend endpoint `/api/payments/verify` with the payment response data from Razorpay.
    *   The backend is expected to validate the payment signature.
6.  **Post-Payment Actions:**
    *   If backend verification is successful, `processingStep` becomes `'completed'`. `onSuccess()` is called, which displays a success toast ("Payment successful! Redirecting to dashboard...") and redirects the user to `/dashboard?payment=success`. The modal closes.
    *   If backend verification fails, `processingStep` reverts to `'ready'`, and `onError()` is called, displaying an error toast ("Payment verification failed").
7.  **Cancellation/Error Handling:**
    *   If the user dismisses the Razorpay popup, `modal.ondismiss` is triggered, setting `processingStep` back to `'ready'` and displaying a "Payment cancelled." toast.
    *   Various `try/catch` blocks provide error messages for issues during subscription creation or payment processing.

### Backend (Inferred Endpoints)

*   `/api/payments/create_subscription`: Initiates a subscription with Razorpay, returning `key_id` and `subscription_id`.
*   `/api/payments/verify`: Verifies the Razorpay payment signature upon successful user payment.

## 2. Future Functionality and Enhancements

The current implementation provides a robust foundation for handling Razorpay subscriptions. Future work should focus on expanding subscription management capabilities and improving user experience.

1.  **Full Subscription Lifecycle Management:**
    *   **Cancel Subscription:** Implement a clear user interface and a backend endpoint (`/api/payments/cancel_subscription`) to allow users to cancel their recurring subscriptions. This would involve calling the Razorpay API to cancel the subscription.
    *   **Change Plan (Upgrade/Downgrade):**
        *   **Downgrade Support:** Currently, downgrading is explicitly disallowed. Implement a mechanism to allow users to downgrade their plans, potentially involving prorated billing and Razorpay API calls (e.g., `update_subscription`).
        *   **Proration Logic:** Handle billing adjustments for upgrades/downgrades mid-cycle.
        *   **Plan Change UI:** Provide clear options and information regarding the financial implications of changing plans.
    *   **Pause Subscription:** (Optional) Allow users to temporarily pause their subscription.

2.  **Improved User Feedback & Error Handling:**
    *   **Specific Error Messages:** Enhance the `usePayment` hook and `PaymentModal` to parse more specific error codes/messages from the backend/Razorpay API and display user-friendly, actionable advice.
    *   **Loading States:** Ensure all asynchronous operations have clear loading indicators.
    *   **Success Confirmation:** A dedicated success screen within the modal or a more prominent success message after successful payment, before redirection.

3.  **Backend Webhooks for Robustness:**
    *   **Automated State Sync:** Implement and secure Razorpay webhooks (`/api/payments/webhook`) on the backend. This is critical for asynchronously receiving updates from Razorpay about subscription status changes (e.g., `subscription.charged`, `subscription.cancelled`, `payment.failed`, `invoice.paid`). This ensures the application's database (`UserSubscription` model) remains consistent with Razorpay's records even if the user closes the browser or loses connection after payment but before the frontend `verify` call completes.

4.  **User Dashboard / Billing Page:**
    *   Create a dedicated section (e.g., `/dashboard/billing`) where users can:
        *   View their current plan details, next billing date, and usage.
        *   Access their invoice history.
        *   Update their payment methods.
        *   Initiate plan changes or cancellations.

5.  **Security and Environment Variables:**
    *   Ensure all sensitive API keys (Razorpay Key ID, Key Secret) are stored securely as environment variables and accessed appropriately by the backend, and that the frontend only accesses public keys (`NEXT_PUBLIC_RAZORPAY_KEY_ID`).
    *   Provide clear instructions for setting up these environment variables in development and production environments.

6.  **Guest Checkout Flow:** (Optional) If allowed by business logic, allow users to purchase a plan before signing up, automatically creating an account for them or linking after purchase.

## 3. Documentation

This document serves as the initial documentation for the payment flow. It will be maintained and updated as new features are implemented.
