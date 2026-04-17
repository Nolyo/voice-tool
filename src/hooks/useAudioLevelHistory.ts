import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";

/**
 * Ring buffer of the last N `audio-level` samples emitted by the Rust backend.
 *
 * The buffer lives in a ref (no React re-render per sample). Consumers drive
 * their own paint loop (e.g. requestAnimationFrame) and read from the buffer
 * + writeIndex directly.
 */
export function useAudioLevelHistory(capacity: number) {
  const bufferRef = useRef<Float32Array>(new Float32Array(capacity));
  const writeIndexRef = useRef(0);
  const capacityRef = useRef(capacity);

  // Resize buffer if capacity changes
  useEffect(() => {
    if (capacityRef.current !== capacity) {
      bufferRef.current = new Float32Array(capacity);
      writeIndexRef.current = 0;
      capacityRef.current = capacity;
    }
  }, [capacity]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    listen<number>("audio-level", (event) => {
      const buf = bufferRef.current;
      const idx = writeIndexRef.current;
      buf[idx] = event.payload;
      writeIndexRef.current = (idx + 1) % buf.length;
    })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((e) => console.error("useAudioLevelHistory listen failed:", e));

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  return { bufferRef, writeIndexRef };
}
