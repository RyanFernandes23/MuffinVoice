# src/utils/redis_client.py
import redis
import os
from dotenv import load_dotenv


load_dotenv()
pool = redis.ConnectionPool(
    host="localhost",
    port=6379,
    # password=os.getenv("REDIS_PASSWORD"),
    decode_responses=True,
    max_connections=30,
)

redis_client = redis.StrictRedis(connection_pool=pool,db=0)
