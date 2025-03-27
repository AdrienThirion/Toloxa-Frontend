import numpy as np
import soxr
import asyncio
import av
from fractions import Fraction
from aiortc import MediaStreamTrack
from time import time

async def consume_audio(track, queue, chunk_size=1024):
    buffer = b""
    while True:
        try:
            frame = await track.recv()
            buffer += frame.to_ndarray().tobytes()
            target_size = int(chunk_size * 96000 / 16000)
            while len(buffer) >= target_size:
                chunk = buffer[:target_size]
                buffer = buffer[target_size:]
                pcm = np.frombuffer(chunk, dtype=np.int16).reshape(-1, 1)
                queue.put(soxr.resample(pcm, 96000, 16000))
        except Exception as e:
            print("Audio consumer stopped:", e)
            break

class TTSAudioStreamTrack(MediaStreamTrack):
    kind = "audio"

    def __init__(self, queue, stop_event, sample_rate=24000, chunk_size=512):
        super().__init__()
        self.queue = queue
        self.stop_event = stop_event
        self.sample_rate = sample_rate
        self.chunk_size = chunk_size
        self.timestamp = time()
        self._frame_time = chunk_size / sample_rate

    async def recv(self):
        while self.queue.empty() and not self.stop_event.is_set():
            await asyncio.sleep(0.01)
        if self.stop_event.is_set():
            raise asyncio.CancelledError("TTS stopped.")
        pcm = np.asarray(self.queue.get(), dtype=np.int16)
        frame = av.AudioFrame(format="s16", layout="mono", samples=len(pcm))
        frame.sample_rate = self.sample_rate
        frame.planes[0].update(pcm.tobytes())
        frame.pts = int(self.timestamp * self.sample_rate)
        frame.time_base = Fraction(1, self.sample_rate)
        self.timestamp += self._frame_time
        await asyncio.sleep(self._frame_time * 0.5)
        return frame
