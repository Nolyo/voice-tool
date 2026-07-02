interface MiniLiveTranscriptProps {
  text: string;
}

/** Longest tail of the live transcript that fits one mini-window line. */
const TAIL_CHARS = 90;

/**
 * One-line live transcript shown in place of the visualizer while a streaming
 * session is recording. Displays the tail of the text (the words just spoken)
 * with a left fade so the cut never looks abrupt.
 */
export function MiniLiveTranscript({ text }: MiniLiveTranscriptProps) {
  const tail = text.length > TAIL_CHARS ? `…${text.slice(-TAIL_CHARS)}` : text;

  return (
    <div
      className="flex-1 min-w-0 overflow-hidden"
      aria-live="polite"
      data-tauri-drag-region
    >
      <p
        className="text-xs text-vt-fg-2 whitespace-nowrap text-right"
        style={{
          maskImage: "linear-gradient(to right, transparent 0, black 16px)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0, black 16px)",
        }}
      >
        {tail}
      </p>
    </div>
  );
}
