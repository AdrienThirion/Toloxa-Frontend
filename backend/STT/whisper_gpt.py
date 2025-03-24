import logging
import os
from time import perf_counter
from baseHandler import BaseHandler
from openai import OpenAI
import tempfile
import numpy as np
import io
import soundfile as sf
from dotenv import load_dotenv

# Load the environment variables from .env file
load_dotenv()

# Now you can access the environment variable just like before
api_key = os.environ.get('OPENAI_API_KEY')

logger = logging.getLogger(__name__)

client = OpenAI()

class WhisperGPTHandler(BaseHandler):
    """
    Handles the Speech To Text generation using a Whisper model.
    """

    def setup(
        self,
        model_name="whisper-1",
        language="fr",
        device="cuda",
        torch_dtype="float16",
        compile_mode=None,
        gen_kwargs={},
    ):
        self.model_name = "whisper-1"
        self.language = "fr"
        self.client = OpenAI(api_key=api_key)

    def process(self, spoken_prompt):
        logger.debug("Inferring with OpenAI Whisper...")

        global pipeline_start
        pipeline_start = perf_counter()
        
        sf.write('new_file.wav', spoken_prompt, 16000)

        # audio_buffer = io.BytesIO()
        # sf.write(audio_buffer, spoken_prompt, 24000, format="WAV")  # Adjust sample rate if needed
        # audio_buffer.seek(0)  # Reset buffer position to the beginning

        try:
            transcription = client.audio.transcriptions.create(
                model=self.model_name, 
                file=open('new_file.wav', "rb"),
                language=self.language if self.language != 'auto' else None
            )
            pred_text = transcription.text.strip()
        except Exception as e:
            logger.error(f"Error during transcription: {e}")
            pred_text = ""

        logger.debug("Finished OpenAI Whisper inference")
        logger.debug(f"Transcribed Text: {pred_text}")
        
        yield (pred_text, self.language if self.language != "auto" else "auto")
