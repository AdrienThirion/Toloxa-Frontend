import { useEffect, useRef } from "react";

function AudioVisualizer({ audioStream, isSessionActive }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!audioStream) {
            console.error("audioStream is null or undefined");
            return;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");

        // ✅ Improve resolution for high-DPI screens
        const dpi = window.devicePixelRatio || 1;
        const computedStyle = getComputedStyle(canvas);
        const width = parseInt(computedStyle.getPropertyValue("width"), 10) * dpi;
        const height = parseInt(computedStyle.getPropertyValue("height"), 10) * dpi;
        canvas.width = width;
        canvas.height = height;
        ctx.scale(dpi, dpi); // ✅ Scale canvas for better rendering

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const micAnalyzer = audioContext.createAnalyser();
        micAnalyzer.fftSize = 256;
        const micDataArray = new Uint8Array(micAnalyzer.frequencyBinCount);
        const micSource = audioContext.createMediaStreamSource(audioStream);
        micSource.connect(micAnalyzer);

        let animationId;
        const draw = () => {
            if (!isSessionActive) {
                ctx.clearRect(0, 0, width, height);
                return;
            }

            ctx.clearRect(0, 0, canvas.width / dpi, canvas.height / dpi);
            micAnalyzer.getByteFrequencyData(micDataArray);

            const centerX = (canvas.width / dpi) / 2;
            const centerY = (canvas.height / dpi) / 2;
            const maxRadius = Math.min(canvas.width / dpi, canvas.height / dpi) / 2.5;
            const numCircles = micDataArray.length;

            for (let i = 0; i < numCircles; i++) {
                const intensity = micDataArray[i] / 255;
                const radius = intensity * maxRadius;
                if (radius > 0) {
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                    ctx.strokeStyle = `rgba(30, 71, 54, ${intensity})`;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            }

            animationId = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            cancelAnimationFrame(animationId);
            audioContext.close();
        };
    }, [audioStream, isSessionActive]);

    return (
        <canvas ref={canvasRef} className="audio-visualizer"></canvas>
    );
}

export default AudioVisualizer;
