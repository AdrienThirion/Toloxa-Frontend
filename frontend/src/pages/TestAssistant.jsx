import React, { useEffect, useRef, useState } from 'react';

// Change to your correct signaling server URL:
const SIGNALING_WS_URL = 'ws://localhost:8000/ws';

function App() {
  // Store one WebSocket instance in state
  const [socket, setSocket] = useState(null);

  // Use refs for the RTCPeerConnection and <audio> elements
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);

  // 1) Create the WebSocket once when component mounts
  useEffect(() => {
    const newSocket = new WebSocket(SIGNALING_WS_URL);

    newSocket.onopen = () => {
      console.log('WebSocket connected');
    };

    newSocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    newSocket.onclose = () => {
      console.log('WebSocket closed');
    };

    // Called whenever we get a message from the Python backend
    newSocket.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      const pc = pcRef.current;
      if (!pc) {
        console.warn("Received message, but no RTCPeerConnection yet:", data);
        return;
      }

      switch (data.type) {
        case 'answer':
          // 5. Set the remote description with the server's answer
          try {
            await pc.setRemoteDescription(data.answer);
            console.log('Remote description set with Answer from server');
          } catch (err) {
            console.error('Error setting remote description:', err);
          }
          break;

        case 'ice-candidate':
          // 6. Add the candidate to the peer connection
          try {
            await pc.addIceCandidate(data.candidate);
            console.log('Added remote ICE candidate');
          } catch (err) {
            console.error('Error adding received ice candidate', err);
          }
          break;

        default:
          console.log('Unknown message', data);
      }
    };

    // Store in state so we can check readyState later
    setSocket(newSocket);

    // Cleanup on unmount (close WebSocket)
    return () => {
      if (newSocket && newSocket.readyState === WebSocket.OPEN) {
        newSocket.close();
      }
    };
  }, []);

  // 2) Create PeerConnection + handlers
  const createPeerConnection = () => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    // When the server streams back audio (if any)
    peerConnection.ontrack = (event) => {
      // Attach remote media stream to our remoteAudioRef
      if (remoteAudioRef.current) {
        console.log('Received remote track, attaching to remoteAudioRef');
        remoteAudioRef.current.srcObject = event.streams[0];
      }
    };

    // ICE candidates generated locally -> send to server
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: 'ice-candidate',
            candidate: event.candidate,
          })
        );
      }
    };

    pcRef.current = peerConnection;
  };

  // 3) Start capturing local audio and send Offer
  const startStream = async () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not ready; cannot start streaming');
      return;
    }

    // Create a new PeerConnection
    createPeerConnection();
    const pc = pcRef.current;

    try {
      // Grab local mic audio
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      // Show local audio track in an <audio> element (muted to avoid echo)
      if (localStreamRef.current) {
        localStreamRef.current.srcObject = localStream;
      }

      // Add audio track(s) to PeerConnection
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });

      // Generate an SDP offer and set as local description
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send Offer to the server
      socket.send(
        JSON.stringify({
          type: 'offer',
          offer: pc.localDescription,
        })
      );
    } catch (err) {
      console.error('Failed to get local stream or create offer:', err);
    }
  };

  return (
    <div>
      <h1>WebRTC Audio Stream to Python Backend</h1>
      <button onClick={startStream}>Start</button>

      {/* Local audio (muted) to confirm your microphone is captured */}
      <div>
        <label>Local Mic Preview:</label>
        <audio ref={localStreamRef} autoPlay muted />
      </div>

      {/* Remote audio (if server sends any media back) */}
      <div>
        <label>Remote Audio:</label>
        <audio ref={remoteAudioRef} autoPlay />
      </div>
    </div>
  );
}

export default App;
