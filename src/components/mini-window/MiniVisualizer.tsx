import { BarsVisualizer } from "./visualizers/BarsVisualizer";
import { WaveformVisualizer } from "./visualizers/WaveformVisualizer";

export type VisualizerMode = "bars" | "waveform";

interface MiniVisualizerProps {
  mode: VisualizerMode;
  audioLevel: number;
  isRecording: boolean;
  waveformCapacity: number;
  /** Used by bars to scale their max height with the available space. */
  barMaxHeight?: number;
}

export function MiniVisualizer({
  mode,
  audioLevel,
  isRecording,
  waveformCapacity,
  barMaxHeight,
}: MiniVisualizerProps) {
  if (mode === "waveform") {
    return (
      <WaveformVisualizer
        isRecording={isRecording}
        capacity={waveformCapacity}
      />
    );
  }
  return (
    <BarsVisualizer
      audioLevel={audioLevel}
      isRecording={isRecording}
      maxHeight={barMaxHeight}
    />
  );
}
