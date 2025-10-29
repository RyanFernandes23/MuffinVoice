from openai import OpenAI
# import pyaudio
from fastapi.responses import StreamingResponse


client = OpenAI(
    base_url="https://pretelephonic-loralee-resignedly.ngrok-free.dev/v1", api_key="not-needed")



def tts_generator(text: str, voice: str = "af_bella"):
    return client.audio.speech.with_streaming_response.create(
        model="kokoro",
        voice=voice,
        response_format="mp3",
        input=text,
    )