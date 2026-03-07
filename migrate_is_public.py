import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

def migrate():
    if not DATABASE_URL:
        print("DATABASE_URL not found in .env")
        return

    print(f"Connecting to database...")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = True
        with conn.cursor() as cursor:
            print("Adding column 'is_public' to table 'notebook'...")
            cursor.execute("ALTER TABLE notebook ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;")
            print("Successfully added 'is_public' column.")
        conn.close()
    except Exception as e:
        print(f"Error adding column: {e}")

if __name__ == "__main__":
    migrate()

if __name__ == "__main__":
    migrate()
