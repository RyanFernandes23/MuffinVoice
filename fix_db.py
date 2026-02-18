import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

def fix_db():
    if not DATABASE_URL:
        print("DATABASE_URL not found in .env")
        return

    engine = create_engine(DATABASE_URL)
    with engine.connect() as connection:
        try:
            print("Dropping unique constraints and indexes from table 'plan'...")
            # Drop constraint on 'name'
            connection.execute(text("ALTER TABLE plan DROP CONSTRAINT IF EXISTS plan_name_key;"))
            # Drop constraint on 'razorpay_plan_id' (if it exists as a constraint)
            connection.execute(text("ALTER TABLE plan DROP CONSTRAINT IF EXISTS plan_razorpay_plan_id_key;"))
            # Drop the unique index on 'razorpay_plan_id'
            connection.execute(text("DROP INDEX IF EXISTS ix_plan_razorpay_plan_id;"))
            connection.commit()
            print("Successfully dropped constraints and indexes.")
        except Exception as e:
            print(f"Error dropping constraint: {e}")

if __name__ == "__main__":
    fix_db()
