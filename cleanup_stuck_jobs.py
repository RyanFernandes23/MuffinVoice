"""
Cleanup script: Marks all 'processing' jobs as 'failed', refunds tokens, and deletes
the notebook entries from the database. Also cleans up Redis job keys.
"""
import os
import redis
from dotenv import load_dotenv
from sqlmodel import Session, create_engine, select, col

load_dotenv()

engine = create_engine(os.getenv("DATABASE_URL"), echo=False)
redis_client = redis.Redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"))

# Import after engine is set up
from src.api.schema import Notebook
from src.api.token_utils import refund_tokens


def cleanup():
    with Session(engine) as session:
        # Find all notebooks stuck in "processing" status
        statement = select(Notebook).where(Notebook.status == "processing")
        stuck_notebooks = session.exec(statement).all()

        if not stuck_notebooks:
            print("No stuck 'processing' notebooks found in the database.")
        else:
            print(f"Found {len(stuck_notebooks)} stuck notebook(s):")

        for nb in stuck_notebooks:
            print(f"\n  Job ID:  {nb.job_id}")
            print(f"  User:   {nb.user_id}")
            print(f"  Title:  {nb.title}")
            print(f"  Tokens: {nb.tokens_requested}")

            # Refund tokens
            if nb.tokens_requested and nb.tokens_requested > 0:
                try:
                    refund_tokens(
                        session=session,
                        user_id=nb.user_id,
                        amount=nb.tokens_requested,
                        notebook_id=nb.job_id,
                    )
                    print(f"  -> Refunded {nb.tokens_requested} tokens")
                except Exception as e:
                    print(f"  -> Token refund failed: {e}")

            # Delete from DB
            session.delete(nb)
            print(f"  -> Deleted from database")

            # Clean up Redis
            redis_key = f"job:{nb.job_id}"
            redis_client.delete(redis_key)
            print(f"  -> Cleaned Redis key: {redis_key}")

        session.commit()

    # Also scan Redis for any orphaned job keys stuck in "processing"
    print("\nScanning Redis for orphaned 'processing' job keys...")
    orphaned = 0
    for key in redis_client.scan_iter(match="job:*"):
        status = redis_client.hget(key, "status")
        if status and status.decode("utf-8") == "processing":
            redis_client.hset(key, "status", "failed")
            orphaned += 1
            print(f"  -> Marked {key.decode()} as failed in Redis")

    if orphaned == 0:
        print("  No orphaned Redis keys found.")

    # Flush the Dramatiq message queue to clear any stuck/retrying messages
    print("\nFlushing Dramatiq queues...")
    for queue_name in ["default", "default.DQ"]:
        queue_len = redis_client.llen(queue_name)
        if queue_len > 0:
            redis_client.delete(queue_name)
            print(f"  -> Flushed '{queue_name}' ({queue_len} messages)")
        else:
            print(f"  -> '{queue_name}' already empty")

    print("\nCleanup complete!")


if __name__ == "__main__":
    cleanup()
