import os

from dotenv import load_dotenv
from dramatiq.brokers.redis import RedisBroker

load_dotenv()
redis_broker = RedisBroker(
    host="localhost", 
    port=6379, 
    password=os.getenv("REDIS_PASSWORD"),
    db=1
)
