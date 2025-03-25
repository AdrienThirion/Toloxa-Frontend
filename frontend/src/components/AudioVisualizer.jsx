import { useEffect, useRef } from "react";

function AudioVisualizer({ audioStream, isSessionActive, variant = "input" }) {
    const canvasRef = useRef(null);
    const animationRef = useRef(null);
    const observerRef = useRef(null);

    const barColor = variant === "input" ? "30, 71, 54" : "201, 167, 64";

    useEffect(() => {
        if (!audioStream) {
            console.error("audioStream is null or undefined");
            return;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        const dpi = window.devicePixelRatio || 1;

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const micAnalyzer = audioContext.createAnalyser();
        micAnalyzer.fftSize = 256;
        const micDataArray = new Uint8Array(micAnalyzer.frequencyBinCount);
        const micSource = audioContext.createMediaStreamSource(audioStream);
        micSource.connect(micAnalyzer);

        const resizeCanvas = () => {
            const parent = canvas.parentElement;
            if (!parent) return;

            const rect = parent.getBoundingClientRect();
            const size = Math.min(rect.width, rect.height);

            canvas.style.width = `${size}px`;
            canvas.style.height = `${size}px`;
            canvas.width = size * dpi;
            canvas.height = size * dpi;
            ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
            ctx.scale(dpi, dpi);
        };

        resizeCanvas();

        observerRef.current = new ResizeObserver(resizeCanvas);
        observerRef.current.observe(canvas.parentElement);

        const draw = () => {
            if (!isSessionActive) {
                ctx.clearRect(0, 0, canvas.width / dpi, canvas.height / dpi);
                return;
            }

            const w = canvas.width / dpi;
            const h = canvas.height / dpi;
            const centerX = w / 2;
            const centerY = h / 2;
            const maxRadius = Math.min(w, h) / 2.5;

            ctx.clearRect(0, 0, w, h);
            micAnalyzer.getByteFrequencyData(micDataArray);

            const numCircles = micDataArray.length / 2;
            if (Math.max(...micDataArray) > 80){
                const fallbackRadius = maxRadius * 0.1; // adjust size as needed
                ctx.beginPath();
                ctx.arc(centerX, centerY, fallbackRadius, 0, 2 * Math.PI);
                ctx.fillStyle = `rgba(${barColor}, 0.5)`; // subtle fill
                ctx.fill();
                for (let i = 0; i < numCircles; i++) {
                    const intensity = micDataArray[i] / 255;
                    const radius = intensity * maxRadius;
                    if (radius > 0 && intensity > 0.05) {
                        ctx.beginPath();
                        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                        ctx.strokeStyle = `rgba(${barColor}, 0.3)`;
                        ctx.lineWidth = 1;
                        ctx.stroke();
                    }
                }
            } 
            animationRef.current = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            cancelAnimationFrame(animationRef.current);
            audioContext.close();
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, [audioStream, isSessionActive, barColor]);

    return <canvas ref={canvasRef} className="audio-visualizer"></canvas>;
}

export default AudioVisualizer;
