from threading import Event
from utils.events import NotifyingEvent
from utils.queues import NotifyingQueue
from utils.thread_manager import ThreadManager
from VAD.vad_handler import VADHandler
from STT.whisper_gpt import WhisperGPTHandler
from LLM.openai_api_language_model import OpenApiModelHandler
from TTS.chatTTS_handler import ChatTTSHandler

def build_pipeline(queues):
    stop_event = queues["stop_event"]
    should_listen = queues["should_listen"]
    should_speak = queues["should_speak"]
    process_run = queues["process_run"]
    recv_audio_chunks_queue = queues["recv_audio_chunks_queue"]
    send_audio_chunks_queue = queues["send_audio_chunks_queue"]
    spoken_prompt_queue = queues["spoken_prompt_queue"]
    text_prompt_queue = queues["text_prompt_queue"]
    lm_response_queue = queues["lm_response_queue"]
    
    should_listen.set()
    should_speak.set()

    vad = VADHandler(
        stop_event,
        queue_in=recv_audio_chunks_queue,
        queue_out=spoken_prompt_queue,
        setup_args=(should_listen, process_run)
    )

    stt = WhisperGPTHandler(
        stop_event,
        queue_in=spoken_prompt_queue,
        queue_out=text_prompt_queue,
        setup_args=(process_run,)
    )

    lm = OpenApiModelHandler(
        stop_event,
        queue_in=text_prompt_queue,
        queue_out=lm_response_queue,
        setup_args=(process_run,)
    )

    tts = ChatTTSHandler(
        stop_event,
        queue_in=lm_response_queue,
        queue_out=send_audio_chunks_queue,
        setup_args=(process_run, should_speak,)
    )

    return ThreadManager([vad, stt, lm, tts]), lm