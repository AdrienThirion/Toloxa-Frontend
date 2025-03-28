import { useNavigate, useLocation } from "react-router-dom"; // ✅ Import useNavigate()
import { useState, useEffect, useRef } from "react";
import "../vocalAssistant.css"; // Import new CSS file
import AudioVisualizer from "../components/AudioVisualizer"; // ✅ Import the new component
import logo from "../assets/logoL.svg"; 
import times from "../assets/times.svg"; 
import audioON from "../assets/Audio-on.svg"; 
import audioOFF from "../assets/Audio-off.svg"; 
import micON from "../assets/mic-on.svg"; 
import micOFF from "../assets/mic-off.svg"; 

const SIGNALING_WS_URL = import.meta.env.VITE_SIGNALING_WS_URL || 'ws://localhost:8000/ws';

function VocalAssistant() {

    const location = useLocation();
    const selectedAppliance = location.state?.appliance;

    const [isMicOn, setIsMicOn] = useState(true); // Track Mic state
    const [isAudioOn, setIsAudioOn] = useState(true); // Track Mic state
    const [isResponding, setIsResponding] = useState(true); // ✅ Track assistant response status
    const [audioStream, setAudioStream] = useState(null);
    const [isSessionActive, _] = useState(true);
    const [outputAudioStream, setOutputAudioStream] = useState(null);
    // const [controller, setController] = useState(null); // ✅ Track the AbortController to cancel response

    const [socket, setSocket] = useState(null);

    // Use refs for the RTCPeerConnection and <audio> elements
    const pcRef = useRef(null);
    const localStreamRef = useRef(null);
    const remoteAudioRef = useRef(null);
    useEffect(() => {

        if (selectedAppliance === undefined) {
            console.error("No appliance selected, redirecting to home page");
            navigate("/"); // ✅ Redirect to home page
        }
        
        const newSocket = new WebSocket(SIGNALING_WS_URL);

        newSocket.onopen = () => {
            console.log('WebSocket connected');
            setSocket(newSocket); // store for global use if needed
            startStream(newSocket); // ✅ only call here, when it's ready

            if (selectedAppliance) {
                newSocket.send(JSON.stringify({
                    type: "selected_appliance",
                    appliance: selectedAppliance
                }));
                console.log("Sent appliance to backend:", selectedAppliance);
            }
        };
    
        newSocket.onerror = (error) => {
          console.error('WebSocket error:', error);
        };
    
        newSocket.onclose = () => {
          console.log('WebSocket closed');
        };

        const handleNewTextItem = (data) => {
            console.log(data.data, data.source);
            if (data.source === "processing") {
              setIsResponding(data.data !== "True");
            } else {
              setMessages((prev) => [...prev, { text: data.data, sender: data.source }]);
            }
          };
          
          const handleAnswer = async (data, pc) => {
            try {
              await pc.setRemoteDescription(data.answer);
              console.log("Remote description set with Answer from server");
            } catch (err) {
              console.error("Error setting remote description:", err);
            }
          };
          
          const handleIceCandidate = async (data, pc) => {
            try {
              await pc.addIceCandidate(data.candidate);
              console.log("Added remote ICE candidate");
            } catch (err) {
              console.error("Error adding received ice candidate", err);
            }
          };
          
          newSocket.onmessage = async (event) => {
            const data = JSON.parse(event.data);
            const pc = pcRef.current;
          
            if (!pc) {
              console.warn("Received message, but no RTCPeerConnection yet:", data);
              return;
            }
          
            switch (data.type) {
              case "new_text_item":
                handleNewTextItem(data);
                break;
              case "answer":
                await handleAnswer(data, pc);
                break;
              case "ice-candidate":
                await handleIceCandidate(data, pc);
                break;
              default:
                console.log("Unknown message", data);
            }
          };
          

        // Store in state so we can check readyState later
        setSocket(newSocket);
        
        if (outputAudioStream && isMicOn) {
            console.log("Mic turned OFF due to output audio stream");
        }
        return () => {
            if (newSocket && newSocket.readyState === WebSocket.OPEN) {
              newSocket.close();
            }
          };
    }, []);

      // 2) Create PeerConnection + handlers
    const createPeerConnection = () => {
        
        const peerConnection = new RTCPeerConnection({
            iceServers: [
              { urls: "stun:global.stun.twilio.com:3478" },
              {
                urls: [
                  "turn:global.turn.twilio.com:3478?transport=udp",
                  "turn:global.turn.twilio.com:3478?transport=tcp",
                  "turn:global.turn.twilio.com:443?transport=tcp"
                ],
                username: "818f375d7989b13d6959ebf28e7b7e4a636c28fed331e734ec0c094e7012964d",
                credential: "hFU2FnLar5AxDihYLJLaG/0uEW9f7nwFMeug7iX0yhM="
              }
            ]
          });
          

        peerConnection.addTransceiver("audio", { direction: "recvonly" });

        peerConnection.ontrack = (event) => {
        console.log("Received remote track:", event.track.kind);

        if (remoteAudioRef.current) {
            console.log('Received remote track, attaching to remoteAudioRef');
            remoteAudioRef.current.srcObject = event.streams[0];
        }

        if (event.track.kind === 'audio') {
            const audioElem = document.createElement('audio');
            audioElem.srcObject = event.streams[0];
            setOutputAudioStream(audioElem.srcObject);
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

        window._pc = peerConnection;

        // Optional: live ICE state logging
        peerConnection.oniceconnectionstatechange = () => {
          console.log("🌐 ICE connection state:", peerConnection.iceConnectionState);
        };
    };

    // 3) Start capturing local audio and send Offer
    const startStream = async (ws) => {
        createPeerConnection();
        const pc = pcRef.current;
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setAudioStream(stream);
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

    const navigate = useNavigate(); // ✅ Hook for navigation
    
    const toggleMic = () => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'toggle_mic' }));
            setIsMicOn((prev) => !prev);
          }
    };

    const toggleAudio = () => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'toggle_audio_output' }));
            setIsAudioOn((prev) => !prev);
          }
    };

    const handleQuit = () => {
        navigate("/"); // ✅ Navigate to home page
    };

    const [messages, setMessages] = useState([]);

    const [input, setInput] = useState("");
    const messagesEndRef = useRef(null); // Reference to the last message

    const textareaRef = useRef(null); // ✅ Reference to textarea

    // ✅ Adjust the height of the textarea dynamically
    const adjustTextareaHeight = () => {
        const textarea = textareaRef.current;
        textarea.style.height = "30px"; // Reset height
        textarea.style.height = `${textarea.scrollHeight - 12}px`; // Set to scroll height
    };
    
    // Scroll to bottom whenever messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Handle message submission
    const sendMessage = () => {
        if (input.trim() === "") return;

        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'user_text_input', text: input }));
        }
        setInput("");
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault(); // ✅ Prevents new line when pressing Enter
            sendMessage();
        }
    };

    const stopResponse = () => {
        // controller.abort(); // ✅ Abort the current response 
    };

    return (
        <div className="vocal-chat-container">
            <div className="vocal-chat-header">
                {/* Left Side (Audio ON & Mic ON) */}
                <div className="left-icons">
                    <img
                        src={isAudioOn ? audioON : audioOFF} // Toggle image
                        alt={isAudioOn ? "Audio ON" : "Audio OFF"}
                        className="icon"
                        onClick={toggleAudio} // Click to toggle
                        style={{ cursor: "pointer" }}
                    />
                    <img
                        src={isMicOn ? micON : micOFF} // Toggle image
                        alt={isMicOn ? "Mic ON" : "Mic OFF"}
                        className="icon"
                        onClick={toggleMic} // Click to toggle
                        style={{ cursor: "pointer" }}
                    />

                </div>

                {/* Center Logo */}
                <img src={logo} alt="Toloxa Logo" className="logo" />

                {/* Right Side (Quit) */}
                <button className="quit-button" onClick={handleQuit}>
                    <img src={times} alt="Quit" className="icon quit-icon" />
                </button>
            </div>

                        {/* ✅ Audio Visualizer (Between Header and Chat) */}

            {(isMicOn || isAudioOn)  && (
                <div className="visualizer-container">
                    <div className="visualizer-wrapper">
                        {audioStream && isMicOn && (
                            <AudioVisualizer
                            audioStream={audioStream}
                            isSessionActive={isSessionActive}
                            variant="input"
                            />
                        )}
                        {outputAudioStream && isAudioOn && (
                            <AudioVisualizer
                            audioStream={outputAudioStream}
                            isSessionActive={isSessionActive}
                            variant="output"
                            />
                        )}
                    </div>
                </div>
            )}

            {/* Chat Messages */}
            <div className="vocal-chat-messages">
                {messages.map((msg, index) => (
                    <div key={index} className={`vocal-message ${msg.sender}`}>
                        {msg.text}
                    </div>
                ))}
                {/* Invisible div to scroll to */}
                <div ref={messagesEndRef} />
            </div>

            {/* Chat Input */}
            <div className="vocal-chat-input-container">
            <textarea 
            ref={textareaRef} // ✅ Attach ref
            className="vocal-chat-input"
            placeholder={isResponding ? "Waiting for response..." : "Send a message..."}
            value={input} // ✅ Controlled input
            onChange={(e) => {setInput(e.target.value); adjustTextareaHeight();}}
            onKeyDown={handleKeyDown} // ✅ Detect "Enter" key
            rows="1"  // Starts with 1 row
            disabled={isResponding} // ✅ Disable input when assistant is responding
        ></textarea>
            {isResponding ? (
                <button className="stop-button" onClick={stopResponse}>
                    <span className="stop-icon">🟥</span>
                </button>
            ) : (
                <button className="vocal-chat-send-button" onClick={sendMessage}>➤</button>
            )}
</div>
        </div>
    );
}

export default VocalAssistant;
