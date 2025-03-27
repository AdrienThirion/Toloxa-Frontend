import json
import asyncio
import websockets
from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.sdp import candidate_from_sdp
from queue import Queue
from threading import Event

from utils.audio import consume_audio, TTSAudioStreamTrack
from utils.pipeline import build_pipeline
from utils.events import NotifyingEvent
from utils.queues import NotifyingQueue

# Global state
client_pipelines = {}
connected_peers = {}


# Global dictionary to store per-client pipelines
client_pipelines = {}

# Function to build a separate pipeline for each client

connected_peers = {}

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
        pipeline, lm_handler = build_pipeline(client_queues)
        client_pipelines[client_id] = {
            "pipeline": pipeline,
            "queues": client_queues,
            "llm_handler": lm_handler  # ← store reference
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
            elif msg_type == "selected_appliance":
                appliance = data.get("appliance")
                
                if client_id in client_pipelines:
                    client_pipelines[client_id]["appliance"] = appliance

                    # ✅ Inject appliance into LLM handler if available
                    llm_handler = client_pipelines[client_id].get("llm_handler")
                    if llm_handler:
                        llm_handler.set_appliance(appliance)
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
