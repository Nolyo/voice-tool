import { useEffect, useRef } from "react";
import { useAudioLevelHistory } from "@/hooks/useAudioLevelHistory";

const AMPLIFICATION = 2.4;

interface WaveformVisualizerProps {
  isRecording: boolean;
  capacity: number;
}

/**
 * Canvas-based "rolling history" waveform. Each frame:
 *  - draws one vertical slice per ring-buffer sample, oldest on the left
 *  - uses CSS pixel dimensions but paints at devicePixelRatio for crispness
 *
 * Audio data is a per-sample RMS (0..1) streamed at whatever rate the
 * Rust audio callback fires. A sliding ring buffer (useAudioLevelHistory)
 * keeps the last N values.
 */
export function WaveformVisualizer({
  isRecording,
  capacity,
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { bufferRef, writeIndexRef } = useAudioLevelHistory(capacity);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    let cancelled = false;

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;
      if (cssWidth === 0 || cssHeight === 0) return;
      const targetW = Math.round(cssWidth * dpr);
      const targetH = Math.round(cssHeight * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
    };

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas);
    resizeCanvas();

    const draw = () => {
      if (cancelled) return;
      if (document.hidden) {
        rafId = requestAnimationFrame(draw);
        return;
      }

      const W = canvas.width;
      const H = canvas.height;
      if (W === 0 || H === 0) {
        rafId = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, W, H);

      const buf = bufferRef.current;
      const writeIdx = writeIndexRef.current;
      const n = buf.length;

      // Oldest sample sits at writeIdx, newest at writeIdx-1 (mod n).
      // We iterate in visual order: left = oldest, right = newest.
      const midY = H / 2;
      const stepX = W / n;

      // Read live design-system tokens so the waveform inherits the
      // current theme (teal accent for recording, fg-3 grey when idle).
      const styles = getComputedStyle(canvas);
      const accent = styles.getPropertyValue("--vt-accent").trim() || "oklch(0.68 0.14 162)";
      const fg3 = styles.getPropertyValue("--vt-fg-3").trim() || "oklch(0.6 0.015 230)";
      const strokeColor = isRecording
        ? `oklch(from ${accent} l c h / 0.95)`
        : `oklch(from ${fg3} l c h / 0.5)`;
      const fillColor = isRecording
        ? `oklch(from ${accent} l c h / 0.22)`
        : `oklch(from ${fg3} l c h / 0.12)`;

      ctx.lineWidth = Math.max(1, Math.round(1.5 * (window.devicePixelRatio || 1)));
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      // Upper envelope path (mirror below mid for filled area)
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const sampleIdx = (writeIdx + i) % n;
        const raw = buf[sampleIdx];
        const eased = Math.pow(Math.min(raw * AMPLIFICATION, 1.0), 0.75);
        const halfH = (eased * H) / 2;
        const x = i * stepX;
        const yTop = midY - halfH;
        if (i === 0) ctx.moveTo(x, yTop);
        else ctx.lineTo(x, yTop);
      }
      // Close back via lower envelope to fill
      for (let i = n - 1; i >= 0; i--) {
        const sampleIdx = (writeIdx + i) % n;
        const raw = buf[sampleIdx];
        const eased = Math.pow(Math.min(raw * AMPLIFICATION, 1.0), 0.75);
        const halfH = (eased * H) / 2;
        const x = i * stepX;
        const yBot = midY + halfH;
        ctx.lineTo(x, yBot);
      }
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();

      // Re-stroke the top envelope for a crisp line
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const sampleIdx = (writeIdx + i) % n;
        const raw = buf[sampleIdx];
        const eased = Math.pow(Math.min(raw * AMPLIFICATION, 1.0), 0.75);
        const halfH = (eased * H) / 2;
        const x = i * stepX;
        const yTop = midY - halfH;
        if (i === 0) ctx.moveTo(x, yTop);
        else ctx.lineTo(x, yTop);
      }
      ctx.strokeStyle = strokeColor;
      ctx.stroke();

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, [bufferRef, writeIndexRef, isRecording]);

  return (
    <div className="relative flex h-full flex-1 items-center px-2">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
