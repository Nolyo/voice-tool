import { useMemo } from "react";

const BAR_COUNT = 16;
const MIN_HEIGHT = 4;
const AMPLIFICATION = 2.4;

interface BarsVisualizerProps {
  audioLevel: number;
  isRecording: boolean;
  /** Max bar height in px. Scaled with the mini-window inner height. */
  maxHeight?: number;
}

export function BarsVisualizer({
  audioLevel,
  isRecording,
  maxHeight = 33,
}: BarsVisualizerProps) {
  const barModifiers = useMemo(
    () => Array.from({ length: BAR_COUNT }, () => 0.7 + Math.random() * 0.3),
    [],
  );

  const easedLevel = Math.pow(
    Math.min(audioLevel * AMPLIFICATION, 1.0),
    0.75,
  );

  return (
    <div className="flex h-full flex-1 items-center gap-[3px] px-2">
      {barModifiers.map((modifier, i) => {
        const dynamicHeight =
          easedLevel * (maxHeight - MIN_HEIGHT) * modifier + MIN_HEIGHT;
        const height = isRecording ? dynamicHeight : MIN_HEIGHT;
        const color = isRecording
          ? "linear-gradient(180deg, oklch(from var(--vt-accent) l c h / 0.95) 0%, oklch(from var(--vt-accent) l c h / 0.55) 100%)"
          : "linear-gradient(180deg, oklch(from var(--vt-fg-3) l c h / 0.4) 0%, oklch(from var(--vt-fg-3) l c h / 0.2) 100%)";

        return (
          <div
            key={i}
            className={`rounded-full transition-all duration-150 ease-out ${
              isRecording ? "vt-anim-wave-bar" : ""
            }`}
            style={{
              width: "2.5px",
              height: `${height}px`,
              backgroundImage: color,
              transitionDelay: `${i * 0.03}s`,
              animationDelay: isRecording ? `${i * 60}ms` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}
