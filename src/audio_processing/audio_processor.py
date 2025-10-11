from openai import OpenAI
import pyaudio
from fastapi.responses import StreamingResponse


client = OpenAI(
    base_url="http://localhost:8880/v1", api_key="not-needed")



def tts_generator(text: str, voice: str = "af_bella"):
    with client.audio.speech.with_streaming_response.create(
        model="kokoro",
        voice=voice,
        response_format="mp3",   # 16-bit signed PCM frames
        input=text,
    ) as response:
        for chunk in response.iter_bytes(chunk_size=1024):
            yield chunk