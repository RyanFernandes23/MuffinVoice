import os

from dotenv import load_dotenv
from dramatiq.brokers.redis import RedisBroker

load_dotenv()
redis_broker = RedisBroker(url="redis://localhost:6379/1")
