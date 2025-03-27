import { useNavigate } from "react-router-dom"; // ✅ Import useNavigate()
import { useState, useEffect, useRef } from "react";
import "../VocalAssistant.css"; // Import new CSS file
import AudioVisualizer from "../components/AudioVisualizer"; // ✅ Import the new component
import logo from "../assets/logoL.svg"; 
import times from "../assets/times.svg"; 
import audioON from "../assets/Audio-on.svg"; 
import audioOFF from "../assets/Audio-off.svg"; 
import micON from "../assets/mic-on.svg"; 
import micOFF from "../assets/mic-off.svg"; 

function VocalAssistant() {
    const [isMicOn, setIsMicOn] = useState(true); // Track Mic state
    const [isAudioOn, setIsAudioOn] = useState(true); // Track Mic state
    const [isResponding, setIsResponding] = useState(false); // ✅ Track assistant response status
    const [audioStream, setAudioStream] = useState(null);
    const [isSessionActive, _] = useState(true);
    const [controller, setController] = useState(null); // ✅ Track the AbortController to cancel response


    useEffect(() => {
        const getAudioStream = async () => {
            try {
                const ms = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                    },
                });
                setAudioStream(ms); // ✅ Store the stream in state
            } catch (error) {
                console.error("Error accessing microphone:", error);
            }
        };

        getAudioStream();
    }, []);

    const navigate = useNavigate(); // ✅ Hook for navigation
    
    const toggleMic = () => {
        setIsMicOn(prevState => !prevState);
    };

    const toggleAudio = () => {
        setIsAudioOn(prevState => !prevState);
    };

    const handleQuit = () => {
        navigate("/"); // ✅ Navigate to home page
    };

    const [messages, setMessages] = useState([
        { text: "Hello! How can I assist you today?", sender: "assistant" }
    ]);
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

        const userMessage = { text: input, sender: "user" };
        setMessages([...messages, userMessage]);
        
        setInput(""); // ✅ Clear input
        setTimeout(() => { 
            textareaRef.current.style.height = "30px"; // ✅ Force reset height
        }, 0); 
        setIsResponding(true); // ✅ Disable input while responding
        // Simulate Assistant Response
        const newController = new AbortController();
        setController(newController);

        simulateAssistantResponse(newController.signal);
    };

    const simulateAssistantResponse = async (signal) => {
        try {
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    setMessages(prevMessages => [
                        ...prevMessages,
                        { text: "I'm here to help! Tell me what you need.", sender: "assistant" }
                    ]);
                    setIsResponding(false); // ✅ Re-enable input
                    resolve();
                }, 3000); // Simulate 3-second delay

                signal.addEventListener("abort", () => {
                    clearTimeout(timeout);
                    reject(new Error("Response Aborted"));
                });
            });
        } catch {
            console.log("Assistant response was stopped.");
            setIsResponding(false); // ✅ Re-enable input
        }
    };

    const stopResponse = () => {
        if (controller) {
            controller.abort(); // ✅ Cancel assistant response
            setController(null);
        }
        setIsResponding(false); // ✅ Re-enable input immediately
    };


    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault(); // ✅ Prevents new line when pressing Enter
            sendMessage();
        }
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


            {<AudioVisualizer audioStream={audioStream} isSessionActive={isSessionActive} />}


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
