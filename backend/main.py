import numpy as np
from queue import Queue
from threading import Event
from fastapi import FastAPI
import soxr
from utils.thread_manager import ThreadManager
from VAD.vad_handler import VADHandler
from STT.whisper_gpt import WhisperGPTHandler
from LLM.openai_api_language_model import OpenApiModelHandler
from TTS.chatTTS_handler import ChatTTSHandler
from time import time 
import asyncio
import json
import websockets
from aiortc import RTCPeerConnection, RTCSessionDescription, AudioStreamTrack
from aiortc.sdp import candidate_from_sdp
from aiortc.mediastreams import MediaStreamTrack
import av  # We’ll create av.AudioFrame objects
import time 
from fractions import Fraction

# Set up FastAPI
app = FastAPI()

# Global dictionary to store per-client pipelines
client_pipelines = {}

# Function to initialize queues and events for each client
class NotifyingEvent(Event):
    def __init__(self, on_put_callback=None, event_loop=None):
        super().__init__()
        self.on_put_callback = on_put_callback
        self.event_loop = event_loop

    def set(self):
        super().set()
        if self.on_put_callback and self.event_loop:
            # Pass both the item and the name of the queue
            asyncio.run_coroutine_threadsafe(
                self.on_put_callback("True", "processing"),
                self.event_loop
            )

    def clear(self):
        super().clear()
        if self.on_put_callback and self.event_loop:
            # Pass both the item and the name of the queue
            asyncio.run_coroutine_threadsafe(
                self.on_put_callback("False", "processing"),
                self.event_loop
            )

class NotifyingQueue(Queue):
    def __init__(self, *args, on_put_callback=None, queue_name=None, event_loop=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.on_put_callback = on_put_callback
        self.queue_name = queue_name
        self.event_loop = event_loop

    def put(self, item, block=True, timeout=None):
        super().put(item, block, timeout)
        if self.on_put_callback and self.event_loop:
            # Pass both the item and the name of the queue
            if isinstance(item, tuple):
                item, _ = item 
            asyncio.run_coroutine_threadsafe(
                self.on_put_callback(item, self.queue_name),
                self.event_loop
            )


# Function to build a separate pipeline for each client
def build_pipeline(client_id, queues):
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
    process_run.set()

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
        setup_args=(process_run)
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

    return ThreadManager([vad, stt, lm, tts])



connected_peers = {}

async def consume_audio(track, audio_queue: Queue, chunk_size=1024):
    """
    Continuously receive audio frames from the given track
    and push raw PCM data into the provided audio_queue.
    """
    print("Audio consumer started.")
    chunk_duration_s = chunk_size / 16000.0

    try:
        extra_data = b''
        while True:
            frame = await track.recv()  # each frame is an aiortc AudioFrame

            extra_data += frame.to_ndarray().tobytes()
            # Convert to raw PCM data (int16)
            true_chunk_size = int(chunk_size * 96000 / 16000)
            while len(extra_data) >= true_chunk_size:
                pcm_data = extra_data[:true_chunk_size]
                extra_data = extra_data[true_chunk_size:]
                pcm_data = np.frombuffer(pcm_data, dtype=np.int16).reshape(-1, 1)
                # Store in the client's queue
                audio_queue.put(soxr.resample(pcm_data, 96000, 16000))
                # await asyncio.sleep(chunk_duration_s * 0.8)
    except Exception as e:
        print("Audio consumer stopped:", e)

async def signaling_handler(websocket):

    # await websocket.accept()

    client_id = id(websocket)
    print(f"New client connected: {client_id}")

    loop = asyncio.get_running_loop()  # 👈 grab the current loop

    async def queue_callback(item, source):
        await websocket.send(json.dumps({
            "type": "new_text_item",
            "source": source,
            "data": str(item)
        }))

    def initialize_client_queues():
        return {
            "stop_event": Event(),
            "should_listen": Event(),
            "should_speak": Event(),
            "process_run" : NotifyingEvent(on_put_callback=queue_callback, event_loop=loop),
            "recv_audio_chunks_queue": Queue(),
            "send_audio_chunks_queue": Queue(),
            "spoken_prompt_queue": Queue(),
            "text_prompt_queue": NotifyingQueue(on_put_callback=queue_callback, queue_name="user", event_loop=loop),
            "lm_response_queue": NotifyingQueue(on_put_callback=queue_callback, queue_name="assistant", event_loop=loop),
        }
    
    if client_id not in client_pipelines:
        client_queues = initialize_client_queues()
        pipeline = build_pipeline(client_id, client_queues)
        client_pipelines[client_id] = {
            "pipeline": pipeline,
            "queues": client_queues
        }
        pipeline.start()

    pc = RTCPeerConnection()
    connected_peers[client_id] = pc

    # # Create our TTS output track
    send_audio_chunks_queue = client_pipelines[client_id]["queues"]["send_audio_chunks_queue"]
    stop_event = client_pipelines[client_id]["queues"]["stop_event"]

    tts_track = TTSAudioStreamTrack(
        queue=send_audio_chunks_queue,
        stop_event=stop_event,
    )

    # # Add the TTS track to the PC as "sendonly"
    # # The easiest way is via transceiver:
    pc.addTransceiver("audio", direction="sendrecv")
    tts_transceiver = pc.getTransceivers()[0] 
    tts_transceiver.sender.replaceTrack(tts_track)


    @pc.on("track")
    def on_track(track):
        if track.kind == "audio":
            print("Received an audio track, forwarding frames to queue...")
            asyncio.create_task(consume_audio(track, client_pipelines[client_id]["queues"]["recv_audio_chunks_queue"]))
        else:
            print(f"Received a {track.kind} track (ignored).")

    @pc.on("iceconnectionstatechange")
    def on_iceconnectionstatechange():
        print("ICE connection state changed to:", pc.iceConnectionState)
        if pc.iceConnectionState == "connected":
            print("WebRTC connected! Media should now flow.")
        elif pc.iceConnectionState == "failed":
            print("ICE failed. Check network or STUN/TURN server config.")
        elif pc.iceConnectionState == "closed":
            print("Peer connection closed.")

    try:
        async for message in websocket:
            data = json.loads(message)
            msg_type = data.get("type")

            if msg_type == "offer":
                offer_sdp = data["offer"]["sdp"]
                offer_type = data["offer"]["type"]
                offer = RTCSessionDescription(sdp=offer_sdp, type=offer_type)

                # Set remote description
                await pc.setRemoteDescription(offer)

                # Create answer
                answer = await pc.createAnswer()
                await pc.setLocalDescription(answer)

                # Send answer back
                await websocket.send(json.dumps({
                    "type": "answer",
                    "answer": {
                        "type": pc.localDescription.type,
                        "sdp": pc.localDescription.sdp
                    }
                }))

            elif msg_type == "toggle_mic":
                should_listen = client_pipelines[client_id]["queues"]["should_listen"]
                if should_listen.is_set():
                    should_listen.clear()
                    print("Mic muted")
                else:
                    should_listen.set()
                    print("Mic unmuted")
            
            elif msg_type == "toggle_audio_output":
                should_speak = client_pipelines[client_id]["queues"]["should_speak"]
                if should_speak.is_set():
                    should_speak.clear()
                    print("Speak stop")
                else:
                    should_speak.set()
                    print("Assistant speak")

            elif msg_type == "user_text_input":
                user_text = data.get("text")
                text_prompt_queue = client_pipelines[client_id]["queues"]["text_prompt_queue"]
                text_prompt_queue.put(user_text)
                print("Received user text response:", user_text)


            elif msg_type == "ice-candidate":
                    c = data["candidate"]  # this is a dict with 'candidate', 'sdpMid', 'sdpMLineIndex'
                    if c is not None and c.get("candidate"):
                        # 1) Parse the SDP candidate string
                        parsed = candidate_from_sdp(c["candidate"])
                        
                        # 2) Attach sdpMid and sdpMLineIndex
                        parsed.sdpMid = c["sdpMid"]
                        parsed.sdpMLineIndex = c["sdpMLineIndex"]
                        
                        # 3) Now we can add it to our PeerConnection
                        await pc.addIceCandidate(parsed)
            else:
                # This might be an empty candidate or end-of-candidates signal
                pass
    except websockets.exceptions.ConnectionClosed:
        print("Client disconnected:", client_id)
    finally:
        # Clean up
        if pc:
            await pc.close()
        if client_id in connected_peers:
            del connected_peers[client_id]
        if client_id in client_pipelines:
            client_pipelines[client_id]["pipeline"].stop()
            del client_pipelines[client_id]

class TTSAudioStreamTrack(MediaStreamTrack):
    """
    A custom audio track that reads PCM data from a queue
    and produces AudioFrames for aiortc to send to the client.
    """
    kind = "audio"

    def __init__(self, queue, stop_event, sample_rate=24000, chunk_size=512):
        super().__init__()  # don't forget this
        self.queue = queue
        self.stop_event = stop_event
        self.sample_rate = sample_rate
        self.chunk_size = chunk_size
        self.timestamp = time.time()

        # Precompute frame time for each chunk, in seconds
        self._frame_time = float(self.chunk_size) / float(self.sample_rate)

    async def recv(self) -> av.AudioFrame:
        """
        Grab a chunk of audio data from the queue and create an AudioFrame.
        If no data is available and the event is stopped, we raise an exception
        to end the track.
        """
        # Wait until we have data or we’re stopping
        while self.queue.empty() and not self.stop_event.is_set():
            await asyncio.sleep(0.01)

        if self.stop_event.is_set():
            raise asyncio.CancelledError("TTSAudioStreamTrack stopping.")

        # Read one chunk (PCM int16) from the queue
        pcm_chunk = self.queue.get()

        # The queue might give us a NumPy array, so ensure we have an ndarray
        pcm_np = np.asarray(pcm_chunk, dtype=np.int16)
        # Create an AudioFrame
        frame = av.AudioFrame(format="s16", layout="mono", samples=len(pcm_np))
        frame.sample_rate = self.sample_rate
        # frame.sample_rate = self.output_sample_rate
        frame.planes[0].update(pcm_np.tobytes())
        # Set pts and timestamp based on how long the chunk is
        # This helps the jitter buffer on the receiving side
        frame.pts = int(self.timestamp * self.sample_rate)
        frame.time_base = Fraction(1, self.sample_rate)
        self.timestamp += self._frame_time

        await asyncio.sleep(self._frame_time * 0.5)

        return frame


async def main():
    async with websockets.serve(signaling_handler, "0.0.0.0", 8000):
        print("Signaling server is listening on port 8000...")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())