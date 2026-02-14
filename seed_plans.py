"""
Database Seeder Script for WikiVoice

This script seeds the database with initial plan data required for the payment system.
Run this after setting up your database and before using the payment features.

Usage:
    python seed_plans.py

Required Environment Variables:
    - DATABASE_URL: PostgreSQL connection string
    - (Optional) RAZORPAY_EXPLORER_PLAN_ID: Razorpay plan ID for Explorer plan
    - (Optional) RAZORPAY_CREATOR_PLAN_ID: Razorpay plan ID for Creator plan
    - (Optional) RAZORPAY_PROFESSIONAL_PLAN_ID: Razorpay plan ID for Professional plan
"""

import os
import sys
from decimal import Decimal

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from dotenv import load_dotenv
from sqlmodel import Session, select, create_engine

from api.schema import Plan, User

load_dotenv()

# Configuration
DATABASE_URL = os.getenv("DATABASE_URL")
EXPLORER_PLAN_ID = os.getenv("RAZORPAY_EXPLORER_PLAN_ID", "")
CREATOR_PLAN_ID = os.getenv("RAZORPAY_CREATOR_PLAN_ID", "")
PROFESSIONAL_PLAN_ID = os.getenv("RAZORPAY_PROFESSIONAL_PLAN_ID", "")

# Plan definitions
PLANS = [
    {
        "plan_id": "plan_explorer",
        "name": "explorer",
        "description": "Free tier with 40k tokens/month. No audio download. Max file size: 50MB. Basic voice options and email support.",
        "price": Decimal("0.00"),
        "currency": "USD",
        "duration_days": 30,
        "is_active": True,
        "razorpay_plan_id": EXPLORER_PLAN_ID,
        "token_limit": 40000,
    },
    {
        "plan_id": "plan_creator",
        "name": "creator",
        "description": "400k tokens/month for $5. Audio download enabled. Max file size: 100MB. All voice options, priority support.",
        "price": Decimal("5.00"),
        "currency": "USD",
        "duration_days": 30,
        "is_active": True,
        "razorpay_plan_id": CREATOR_PLAN_ID,
        "token_limit": 400000,
    },
    {
        "plan_id": "plan_professional",
        "name": "professional",
        "description": "1.6M tokens/month for $12. Audio download enabled. Max file size: 150MB. All voices including AI, 24/7 dedicated support, team collaboration.",
        "price": Decimal("12.00"),
        "currency": "USD",
        "duration_days": 30,
        "is_active": True,
        "razorpay_plan_id": PROFESSIONAL_PLAN_ID,
        "token_limit": 1600000,
    },
]


def seed_plans():
    """Seed the database with plan data."""
    if not DATABASE_URL:
        print("[ERROR] DATABASE_URL environment variable is required")
        print("   Please set it in your .env file or environment")
        sys.exit(1)

    print("[INFO] Connecting to database...")
    engine = create_engine(DATABASE_URL, echo=False)

    with Session(engine) as session:
        print("[INFO] Seeding plans...")

        for plan_data in PLANS:
            # Check if plan already exists
            existing = session.exec(
                select(Plan).where(Plan.plan_id == plan_data["plan_id"])
            ).first()

            if existing:
                print(
                    f"   [UPDATE] Plan '{plan_data['name']}' already exists, updating..."
                )
                # Update existing plan with new data
                existing.description = plan_data["description"]
                existing.price = plan_data["price"]
                existing.currency = plan_data["currency"]
                existing.duration_days = plan_data["duration_days"]
                existing.is_active = plan_data["is_active"]
                existing.token_limit = plan_data["token_limit"]
                if plan_data["razorpay_plan_id"]:
                    existing.razorpay_plan_id = plan_data["razorpay_plan_id"]
                session.add(existing)
            else:
                print(f"   [CREATE] Creating plan '{plan_data['name']}'...")
                plan = Plan(**plan_data)
                session.add(plan)

        session.commit()

        # Create system user for webhook error logging
        print("[INFO] Checking system user...")
        system_user = session.exec(select(User).where(User.user_id == "system")).first()
        if not system_user:
            print("   [CREATE] Creating system user...")
            system_user = User(
                user_id="system",
                username="system",
                email="system@wikivoice.local",
                password_hash=None,
            )
            session.add(system_user)
            session.commit()
            print("   [SUCCESS] System user created")
        else:
            print("   [INFO] System user already exists")

    print("[SUCCESS] Plans seeded successfully!")
    print("\n[INFO] Seeded Plans:")
    print("   - Explorer: $0.00/month (40k tokens, no download, 50MB max file)")
    print("   - Creator: $5.00/month (400k tokens, download enabled, 100MB max file)")
    print(
        "   - Professional: $12.00/month (1.6M tokens, download enabled, 150MB max file)"
    )

    # Check if Razorpay plan IDs are set
    if not EXPLORER_PLAN_ID:
        print("\n[WARNING] RAZORPAY_EXPLORER_PLAN_ID not set")
        print("   Add this to your .env file from your Razorpay Dashboard")
    if not CREATOR_PLAN_ID:
        print("\n[WARNING] RAZORPAY_CREATOR_PLAN_ID not set")
        print("   Add this to your .env file from your Razorpay Dashboard")
    if not PROFESSIONAL_PLAN_ID:
        print("\n[WARNING] RAZORPAY_PROFESSIONAL_PLAN_ID not set")
        print("   Add this to your .env file from your Razorpay Dashboard")

    if not EXPLORER_PLAN_ID or not CREATOR_PLAN_ID or not PROFESSIONAL_PLAN_ID:
        print("\n[TIP] To get Razorpay Plan IDs:")
        print("   1. Go to Razorpay Dashboard -> Subscriptions -> Plans")
        print(
            "   2. Create plans for Explorer ($0), Creator ($5) and Professional ($12)"
        )
        print("   3. Copy the Plan IDs and add them to your .env file:")
        print("      RAZORPAY_EXPLORER_PLAN_ID=plan_xxxxxx")
        print("      RAZORPAY_CREATOR_PLAN_ID=plan_xxxxxx")
        print("      RAZORPAY_PROFESSIONAL_PLAN_ID=plan_xxxxxx")


def verify_seed_data(engine):
    """Verify that all required seed data exists."""
    print("\n[INFO] Verifying seed data...")
    all_valid = True

    with Session(engine) as session:
        # Check all plans exist
        for plan_data in PLANS:
            plan = session.exec(
                select(Plan).where(Plan.plan_id == plan_data["plan_id"])
            ).first()
            if not plan:
                print(f"   [ERROR] Plan '{plan_data['plan_id']}' is missing!")
                all_valid = False
            else:
                print(
                    f"   [OK] Plan '{plan_data['name']}' exists with {plan.token_limit} tokens"
                )

        # Check system user exists
        system_user = session.exec(select(User).where(User.user_id == "system")).first()
        if not system_user:
            print("   [ERROR] System user is missing!")
            all_valid = False
        else:
            print("   [OK] System user exists")

    if all_valid:
        print("\n[SUCCESS] All seed data verified successfully!")
        return True
    else:
        print("\n[WARNING] Some seed data is missing. Please run seeding again.")
        return False


if __name__ == "__main__":
    seed_plans()
    # Verify after seeding
    if DATABASE_URL:
        engine = create_engine(DATABASE_URL, echo=False)
        verify_seed_data(engine)
