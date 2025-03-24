import logging
from baseHandler import BaseHandler
import librosa
import numpy as np
from rich.console import Console
import os

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

console = Console()

from openai import OpenAI
from dotenv import load_dotenv

# Load the environment variables from .env file
load_dotenv()

# Now you can access the environment variable just like before
api_key = os.environ.get('OPENAI_API_KEY')


client = OpenAI()   


class ChatTTSHandler(BaseHandler):
    def setup(
        self,
        process_run,
        should_speak,
        stream=True,
        chunk_size=512,
        device=None,
        gen_kwargs={}
    ):
        self.process_run = process_run
        self.should_speak = should_speak
        self.client = OpenAI(api_key=api_key)
        self.chunk_size = chunk_size
        self.stream = stream

    def process(self, llm_sentence):
        if isinstance(llm_sentence, tuple):
            llm_sentence, _ = llm_sentence

        console.print(f"[green]ASSISTANT: {llm_sentence}")
        
        if self.should_speak.is_set():
            with self.client.audio.speech.with_streaming_response.create(
                model="tts-1",
                voice="ash",
                response_format="pcm",  # Raw PCM format (16-bit signed, 24kHz)
                input=llm_sentence,
            ) as response:
                for chunk in response.iter_bytes(int(2 * self.chunk_size)):
                    audio_chunk = np.frombuffer(chunk, dtype=np.int16)
                    # audio_chunk = librosa.resample(audio_chunk.astype(np.float32), orig_sr=24000, target_sr=16000)
                    # audio_chunk = librosa.effects.time_stretch(audio_chunk, rate=speed_factor)
                    yield np.pad(audio_chunk, (0, self.chunk_size - len(audio_chunk)),)
        self.process_run.set()
