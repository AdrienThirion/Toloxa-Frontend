import React, { useEffect, useRef, useState } from 'react';

// Change to your correct signaling server URL:
const SIGNALING_WS_URL = 'ws://localhost:8000/ws';

function App() {
  // Store one WebSocket instance in state
  const [socket, setSocket] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [micMuted, setMicMuted] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [userInput, setUserInput] = useState("");

  // Use refs for the RTCPeerConnection and <audio> elements
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);

  // 1) Create the WebSocket once when component mounts
  useEffect(() => {
    const newSocket = new WebSocket(SIGNALING_WS_URL);

    newSocket.onopen = () => {
      console.log('WebSocket connected');
      setSocket(newSocket); // store for global use if needed
      startStream(newSocket); // ✅ only call here, when it's ready
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
        case 'new_text_item':
          setChatMessages(prev => [...prev, { role: data.source, text: data.data }]);
          break;
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
    // setSocket(newSocket);

    // Cleanup on unmount (close WebSocket)
    return () => {
      if (newSocket && newSocket.readyState === WebSocket.OPEN) {
        newSocket.close();
      }
    };
  }, []);

  const toggleMic = () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'toggle_mic' }));
      setMicMuted((prev) => !prev);
    }
  };
  
  const toggleAudioOutput = () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'toggle_audio_output' }));
      setAudioMuted((prev) => !prev);
    }
  };
  
  const sendUserTextResponse = () => {
    if (socket && socket.readyState === WebSocket.OPEN && userInput.trim() !== "") {
      socket.send(JSON.stringify({ type: 'user_text_input', text: userInput }));
      setUserInput("");
    }
  };

  // 2) Create PeerConnection + handlers
  const createPeerConnection = () => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    peerConnection.ontrack = (event) => {
      console.log("Received remote track:", event.track.kind);


      if (remoteAudioRef.current) {
        console.log('Received remote track, attaching to remoteAudioRef');
        remoteAudioRef.current.srcObject = event.streams[0];
      }

      if (event.track.kind === 'audio') {
        const audioElem = document.createElement('audio');
        audioElem.srcObject = event.streams[0];
        audioElem.autoplay = true;
        document.body.appendChild(audioElem);
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
  const startStream = async (ws) => {
    createPeerConnection();
    const pc = pcRef.current;
  
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // setLocalStream(stream);
      if (localStreamRef.current) {
        localStreamRef.current.srcObject = stream;
      }
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
  
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
  
      ws.send(JSON.stringify({
        type: 'offer',
        offer: pc.localDescription,
      }));
    } catch (err) {
      console.error('Error getting mic or sending offer:', err);
    }
  };
  
  return (
    <div>
      <h1>WebRTC Audio Stream to Python Backend</h1>
      <button onClick={startStream}>Start</button>

      {/* Local audio (muted) to confirm your microphone is captured */}
      <div>
        <label style={{ color: 'black' }}>Local Mic Preview:</label>
        <audio ref={localStreamRef} autoPlay muted style={{ color: 'black' }} />
      </div>

      {/* Remote audio (if server sends any media back) */}
      <div>
        <label style={{ color: 'black' }}>Remote Audio:</label>
        <audio ref={remoteAudioRef} autoPlay  style={{ color: 'black' }}/>
      </div>
      
      <div style={{ marginTop: 20 }}>
        <h3 style={{ color: 'black' }}>Chat Log</h3>
        <div style={{ background: '#f4f4f4', padding: '1rem', borderRadius: '8px', maxHeight: 300, overflowY: 'auto' }}>
          {chatMessages.map((msg, idx) => (
            <div key={idx} style={{ marginBottom: '0.5rem', color: 'black'}}>
              <strong >{msg.role === "user" ? "You" : "Assistant"}:</strong> {msg.text}
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 20,  color: 'black' }}>
        <button onClick={toggleMic}>
          {micMuted ? "🎤 Unmute Mic" : "🎙️ Mute Mic"}
        </button>

        <button onClick={toggleAudioOutput} style={{ marginLeft: 10 }}>
          {audioMuted ? "🔈 Unmute Audio" : "🔇 Mute Audio"}
        </button>
      </div>

      <div style={{ marginTop: 20,  color: 'black'  }}>
        <input
          type="text"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Type your message..."
          style={{ padding: "10px", width: "80%", borderRadius: 8, border: "1px solid #ddd" }}
        />
        <button onClick={sendUserTextResponse} style={{ marginLeft: 10 }}>
          Send
        </button>
      </div>
    </div>
    
  );
}

export default App;
