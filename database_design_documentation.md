# Database Design for Payments and Subscriptions with Failure Tracking

This document outlines a relational database schema designed to manage user payments, subscriptions, and critically, to track various payment-related events and failures, including scenarios where a user pays but a subscription is not activated.

## Table of Contents
1.  [Core Entities](#core-entities)
2.  [Database Schema](#database-schema)
    *   [Users Table](#users-table)
    *   [Plans Table](#plans-table)
    *   [Payments Table](#payments-table)
    *   [Subscriptions Table](#subscriptions-table)
    *   [Payment_Events Table](#payment_events-table)
3.  [Relationships](#relationships)
4.  [Handling "User Paid, No Activation" Scenario](#handling-user-paid-no-activation-scenario)
5.  [Example SQL Queries](#example-sql-queries)
6.  [Data Type and Constraint Guidelines](#data-type-and-constraint-guidelines)
7.  [Conclusion](#conclusion)

## 1. Core Entities

The system revolves around the following core entities:

*   **User:** The individual making payments and managing subscriptions.
*   **Plan:** Defines the subscription offerings (e.g., Basic, Premium), including pricing and duration.
*   **Payment:** Represents a financial transaction initiated by a user, which may or may not lead to a subscription.
*   **Subscription:** Represents an active service agreement for a specific plan by a user.
*   **Payment_Events:** A robust logging mechanism to track all significant events in the payment and subscription lifecycle, especially failures and anomalies.

## 2. Database Schema

Below are the `CREATE TABLE` statements for each entity, along with their respective rationales.

### Users Table
```sql
-- Table: Users
CREATE TABLE users (
    user_id VARCHAR(255) PRIMARY KEY, -- Unique user identifier (e.g., UUID, or from an authentication system)
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),       -- Store hashed passwords, not plain text
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users (email);
```
**Rationale:** Standard user management table. `user_id` serves as the primary key for referencing from other tables. `username` and `email` are unique for user identification. `password_hash` stores secure password representations. Timestamps track creation and last update.

### Plans Table
```sql
-- Table: Plans
CREATE TABLE plans (
    plan_id VARCHAR(255) PRIMARY KEY, -- Unique plan identifier (e.g., UUID or product code)
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    duration_days INT NOT NULL,       -- Duration of the plan in days (e.g., 30 for monthly, 365 for yearly)
    is_active BOOLEAN DEFAULT TRUE,   -- Whether the plan is currently available for subscription
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```
**Rationale:** Defines different subscription tiers. `plan_id` is the primary key. `name` is unique for easy identification. `price` uses `DECIMAL` for precision. `duration_days` helps calculate subscription end dates. `is_active` allows plans to be enabled/disabled without deletion.

### Payments Table
```sql
-- Table: Payments
CREATE TABLE payments (
    payment_id VARCHAR(255) PRIMARY KEY,       -- Unique ID for the payment (e.g., UUID, or ID from payment gateway)
    user_id VARCHAR(255) NOT NULL,            -- Foreign Key to users table
    plan_id VARCHAR(255),                     -- Foreign Key to plans table (nullable if payment isn't directly for a plan)
    amount DECIMAL(10, 2) NOT NULL,           -- Amount paid
    currency VARCHAR(3) NOT NULL,             -- Currency code (e.g., 'USD', 'INR')
    status VARCHAR(50) NOT NULL,              -- Current status of the payment (e.g., 'pending', 'successful', 'failed', 'refunded', 'authorized')
    gateway_payment_id VARCHAR(255),          -- Payment ID from the payment gateway (e.g., Razorpay order_id or payment_id)
    gateway_order_id VARCHAR(255),            -- Order ID from the payment gateway (if applicable)
    gateway_signature VARCHAR(512),           -- Signature for webhook verification (e.g., Razorpay signature)
    gateway_response_code VARCHAR(100),       -- Response code from payment gateway
    gateway_response_message TEXT,            -- Detailed message from payment gateway
    payment_method VARCHAR(50),               -- Method used for payment (e.g., 'credit_card', 'upi', 'netbanking', 'wallet')
    transaction_timestamp TIMESTAMP WITH TIME ZONE NOT NULL, -- When the transaction occurred
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user
        FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_plan
        FOREIGN KEY (plan_id)
        REFERENCES plans (plan_id)
        ON DELETE SET NULL
);

CREATE INDEX idx_payments_user_id ON payments (user_id);
CREATE INDEX idx_payments_status ON payments (status);
CREATE INDEX idx_payments_gateway_payment_id ON payments (gateway_payment_id);
```
**Rationale:** Tracks individual payment transactions. `payment_id` is the primary key. `user_id` and `plan_id` link to other entities. `amount`, `currency`, and `status` are essential financial details. `gateway_*` fields store external payment gateway information for reconciliation and debugging. `transaction_timestamp` records the actual payment time. Indexes optimize common lookups.

### Subscriptions Table
```sql
-- Table: Subscriptions
CREATE TABLE subscriptions (
    subscription_id VARCHAR(255) PRIMARY KEY, -- Unique ID for the subscription
    user_id VARCHAR(255) NOT NULL,            -- Foreign Key to users table
    plan_id VARCHAR(255) NOT NULL,            -- Foreign Key to plans table
    payment_id VARCHAR(255),                  -- Foreign Key to payments table (nullable if created via admin or free trial)
    start_date DATE NOT NULL,                 -- When the subscription becomes active
    end_date DATE NOT NULL,                   -- When the subscription is set to expire
    status VARCHAR(50) NOT NULL,              -- Current status (e.g., 'active', 'inactive', 'cancelled', 'trial', 'expired', 'grace_period')
    auto_renew_enabled BOOLEAN DEFAULT FALSE, -- Whether auto-renewal is enabled
    cancelled_at TIMESTAMP WITH TIME ZONE,    -- When the subscription was cancelled
    cancel_reason TEXT,                       -- Reason for cancellation
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_subscription
        FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_plan_subscription
        FOREIGN KEY (plan_id)
        REFERENCES plans (plan_id)
        ON DELETE RESTRICT, -- Prevent deleting a plan that has active subscriptions
    CONSTRAINT fk_payment_subscription
        FOREIGN KEY (payment_id)
        REFERENCES payments (payment_id)
        ON DELETE SET NULL, -- If a payment record is deleted, keep the subscription but unlink the payment
    UNIQUE (user_id, plan_id, start_date) -- Prevent duplicate active subscriptions for the same user/plan at the same time
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions (user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions (status);
CREATE INDEX idx_subscriptions_end_date ON subscriptions (end_date);
```
**Rationale:** Represents a user's active or past enrollment in a plan. `subscription_id` is the primary key. `user_id` and `plan_id` are foreign keys. `payment_id` links to the initiating payment (nullable for non-paid subscriptions). `start_date` and `end_date` define validity. `status` tracks lifecycle. `auto_renew_enabled`, `cancelled_at`, and `cancel_reason` support subscription management. `ON DELETE RESTRICT` for `plan_id` protects data integrity.

### Payment_Events Table
```sql
-- Table: Payment_Events
CREATE TABLE payment_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Unique ID for each event
    user_id VARCHAR(255) NOT NULL,                 -- Foreign Key to users table
    payment_id VARCHAR(255),                       -- Foreign Key to payments table (nullable, as some events might precede a formal payment record or be loosely coupled)
    subscription_id VARCHAR(255),                  -- Foreign Key to subscriptions table (nullable, for events before or after subscription creation)
    event_type VARCHAR(100) NOT NULL,              -- Type of event (e.g., 'payment_initiated', 'payment_failed', 'subscription_activation_failed', 'webhook_received', 'manual_intervention')
    event_description TEXT,                        -- Detailed description of the event
    error_code VARCHAR(100),                       -- Specific error code if applicable
    error_details JSONB,                           -- JSON object for storing additional, unstructured error details from gateways or internal systems
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_resolved BOOLEAN DEFAULT FALSE,             -- Flag to mark if a failure/issue has been addressed
    resolved_at TIMESTAMP WITH TIME ZONE,          -- Timestamp when the issue was resolved
    resolved_by VARCHAR(255),                      -- User or system that resolved the issue
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_event_user
        FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_event_payment
        FOREIGN KEY (payment_id)
        REFERENCES payments (payment_id)
        ON DELETE SET NULL,
    CONSTRAINT fk_event_subscription
        FOREIGN KEY (subscription_id)
        REFERENCES subscriptions (subscription_id)
        ON DELETE SET NULL
);

CREATE INDEX idx_payment_events_user_id ON payment_events (user_id);
CREATE INDEX idx_payment_events_event_type ON payment_events (event_type);
CREATE INDEX idx_payment_events_payment_id ON payment_events (payment_id);
CREATE INDEX idx_payment_events_timestamp ON payment_events (timestamp);
```
**Rationale:** This table is crucial for auditing and tracking the payment and subscription lifecycle, particularly for identifying and resolving issues. `event_id` is a UUID for universal uniqueness. `user_id`, `payment_id`, and `subscription_id` link to related records (nullable where appropriate). `event_type` and `event_description` classify and detail incidents. `error_code` and `error_details` (JSONB) store granular failure information. `is_resolved`, `resolved_at`, and `resolved_by` provide a workflow for managing and resolving anomalies.

## 3. Relationships

The relationships between the tables are established through Foreign Key constraints, ensuring data integrity:

*   **Users to Payments (One-to-Many):** A user can make multiple payments. (`payments.user_id` references `users.user_id` `ON DELETE CASCADE`)
*   **Users to Subscriptions (One-to-Many):** A user can have multiple subscriptions over time. (`subscriptions.user_id` references `users.user_id` `ON DELETE CASCADE`)
*   **Users to Payment_Events (One-to-Many):** A user can be associated with many payment-related events. (`payment_events.user_id` references `users.user_id` `ON DELETE CASCADE`)
*   **Plans to Payments (One-to-Many):** A plan can be the subject of multiple payments. (`payments.plan_id` references `plans.plan_id` `ON DELETE SET NULL`)
*   **Plans to Subscriptions (One-to-Many):** A plan can have many active or historical subscriptions. (`subscriptions.plan_id` references `plans.plan_id` `ON DELETE RESTRICT`)
*   **Payments to Subscriptions (One-to-Optional-One):** A payment can lead to one subscription; a subscription is typically initiated by one payment, but can also be created without one (e.g., free trial). (`subscriptions.payment_id` references `payments.payment_id` `ON DELETE SET NULL`)
*   **Payments to Payment_Events (One-to-Many):** A specific payment transaction can have multiple associated events (e.g., initiated, successful, webhook received). (`payment_events.payment_id` references `payments.payment_id` `ON DELETE SET NULL`)
*   **Subscriptions to Payment_Events (One-to-Many):** A subscription's lifecycle can generate multiple events (e.g., activation failure, renewal failure). (`payment_events.subscription_id` references `subscriptions.subscription_id` `ON DELETE SET NULL`)

## 4. Handling "User Paid, No Activation" Scenario

This scenario, where a user successfully completes a payment but their subscription is not activated, is critical to track. The `Payment_Events` table is specifically designed to manage this:

**Process:**
1.  **Payment Success:** A payment record in the `payments` table is updated to `status = 'successful'` after gateway confirmation.
2.  **Subscription Activation Attempt:** The system attempts to create or activate a corresponding subscription in the `subscriptions` table.
3.  **Failure Logging:** If this activation attempt fails for any reason (e.g., backend error, data inconsistency, third-party service issue):
    *   An entry is made in the `payment_events` table with:
        *   `event_type = 'subscription_activation_failed'`
        *   `user_id` and `payment_id` linked to the successful payment.
        *   `event_description`, `error_code`, and `error_details` capturing the specifics of the failure.
        *   `is_resolved = FALSE` by default.

**Identification and Resolution:**
Support or automated reconciliation systems can query `payment_events` for `event_type = 'subscription_activation_failed'` and `is_resolved = FALSE`. This identifies pending issues. After investigation and manual intervention (e.g., manually creating the subscription or refunding the user), the `payment_events` record can be updated with `is_resolved = TRUE`, `resolved_at`, and `resolved_by` for a complete audit trail.

## 5. Example SQL Queries

Here are practical SQL queries to demonstrate data retrieval for common scenarios:

1.  **Find all successful payments for a specific user:**
    ```sql
    SELECT *
    FROM payments
    WHERE user_id = 'user_A_uuid' AND status = 'successful';
    ```

2.  **Get all active subscriptions for a user:**
    ```sql
    SELECT s.*, p.name AS plan_name, p.price, p.currency
    FROM subscriptions s
    JOIN plans p ON s.plan_id = p.plan_id
    WHERE s.user_id = 'user_B_uuid'
      AND s.status = 'active'
      AND s.end_date >= CURRENT_DATE;
    ```

3.  **Identify payments that were successful but currently have no *active* subscription, potentially due to activation failure:**
    ```sql
    SELECT
        p.payment_id,
        p.user_id,
        u.email,
        p.amount,
        p.currency,
        p.transaction_timestamp,
        pe.event_description AS activation_failure_event_description,
        pe.timestamp AS activation_failure_event_timestamp
    FROM payments p
    JOIN users u ON p.user_id = u.user_id
    LEFT JOIN subscriptions s ON p.payment_id = s.payment_id AND s.status = 'active' AND s.end_date >= CURRENT_DATE
    LEFT JOIN payment_events pe ON p.payment_id = pe.payment_id AND pe.event_type = 'subscription_activation_failed' AND pe.is_resolved = FALSE
    WHERE p.status = 'successful'
      AND s.subscription_id IS NULL; -- No active subscription linked to this successful payment
    ```

4.  **Find all payment events (including failures) for a user, ordered by time:**
    ```sql
    SELECT *
    FROM payment_events
    WHERE user_id = 'user_C_uuid'
    ORDER BY timestamp DESC;
    ```

5.  **Get unresolved subscription activation failures:**
    ```sql
    SELECT
        pe.event_id,
        pe.user_id,
        u.email,
        pe.payment_id,
        pe.event_description,
        pe.timestamp
    FROM payment_events pe
    JOIN users u ON pe.user_id = u.user_id
    WHERE pe.event_type = 'subscription_activation_failed'
      AND pe.is_resolved = FALSE;
    ```

## 6. Data Type and Constraint Guidelines

Consistent application of data types and constraints is vital for database integrity, performance, and maintainability.

*   **Primary Keys (`*_id`):** `VARCHAR(255)` (for UUIDs or gateway IDs), `PRIMARY KEY`.
*   **Foreign Keys (`*_id`):** Match referenced Primary Key type, `FOREIGN KEY` with appropriate `ON DELETE` actions (`CASCADE`, `SET NULL`, `RESTRICT`).
*   **Timestamps:** `TIMESTAMP WITH TIME ZONE` (preferred for global applications), `DEFAULT CURRENT_TIMESTAMP` for `created_at` and `updated_at`.
*   **Booleans:** `BOOLEAN` (or database equivalent), often with `DEFAULT` value.
*   **Text Strings:** `VARCHAR(X)` for fixed-length or shorter varying strings, `TEXT` for longer content.
*   **Monetary Values:** `DECIMAL(precision, scale)` (e.g., `DECIMAL(10, 2)`) for exact numerical representation.
*   **Enumerated Types:** `VARCHAR(X)` with application-level validation or database `CHECK` constraints.
*   **JSON Data:** `JSONB` (PostgreSQL) or `JSON` (other DBs) for flexible semi-structured data storage.
*   **Nullability:** `NOT NULL` for required fields, otherwise `NULL` is allowed.
*   **Uniqueness:** `UNIQUE` constraint for preventing duplicate values in specified columns or column combinations.

## 7. Conclusion

This database design provides a solid foundation for managing payments and subscriptions, with particular attention paid to tracking and resolving potential failures. The `Payment_Events` table is a flexible tool for auditing system behavior, diagnosing issues like unactivated subscriptions, and supporting customer service and reconciliation efforts. Adhering to the specified data types and constraints will ensure data integrity and system reliability.