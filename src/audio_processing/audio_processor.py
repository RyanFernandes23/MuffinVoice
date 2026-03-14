# import pyaudio
import os
from openai import OpenAI


# Lazy per-call client to avoid module-level httpx connection pool
# that crashes on Windows during Dramatiq worker shutdown (0xC0000005).
_TTS_BASE_URL = os.getenv(
    "TTS_BASE_URL", "https://pretelephonic-loralee-resignedly.ngrok-free.dev/v1"
)


import httpx

def _get_client():
    # Configure custom httpx client with retries for transient SSL/Connection errors
    http_client = httpx.Client(
        transport=httpx.HTTPTransport(retries=5),
        timeout=httpx.Timeout(60.0, connect=20.0)
    )
    return OpenAI(base_url=_TTS_BASE_URL, api_key="not-needed", http_client=http_client)


from contextlib import contextmanager

@contextmanager
def tts_generator(text: str, voice: str = "af_bella"):
    with _get_client() as client:
        with client.audio.speech.with_streaming_response.create(
            model="kokoro",
            voice=voice,
            response_format="mp3",
            input=text,
        ) as response:
            yield response
