import { useCallback, useEffect, useRef, useState } from "react";
import {
  exceedsDragThreshold,
  isOutsideStrip,
  isOutsideViewport,
  type StripRect,
} from "@/lib/notes-window/drag-out";

export interface TabDragState {
  id: string;
  title: string;
  x: number;
  y: number;
}

/**
 * Drag-out gesture for the notes tab strip (spec §6, level 1 « au lâcher »):
 * pointerdown on a tab arms the gesture; once the pointer travels beyond the
 * threshold a ghost follows the cursor; releasing OUTSIDE the tab bar —
 * Notepad-style, even inside the app window — detaches the note at the OS
 * cursor position (Rust resolves the physical coordinates — no DPI math
 * here). Releasing on the bar, or pressing Escape, cancels. A completed drag
 * suppresses the click that follows it so the tab doesn't also activate.
 */
export function useTabDragOut({
  onDetachAtCursor,
  getStripRect,
}: {
  onDetachAtCursor: (id: string) => void;
  /** Bounds of the tab bar (the cancel zone), queried at release time so
   *  scroll/resize during the drag can't stale it. `null` falls back to the
   *  outside-viewport criterion. */
  getStripRect: () => StripRect | null;
}) {
  const [drag, setDrag] = useState<TabDragState | null>(null);
  const armedRef = useRef<TabDragState | null>(null);
  const draggingRef = useRef(false);
  const suppressNextClick = useRef(false);
  const onDetachAtCursorRef = useRef(onDetachAtCursor);
  onDetachAtCursorRef.current = onDetachAtCursor;
  const getStripRectRef = useRef(getStripRect);
  getStripRectRef.current = getStripRect;

  const reset = useCallback(() => {
    armedRef.current = null;
    draggingRef.current = false;
    setDrag(null);
  }, []);

  const handleTabPointerDown = useCallback(
    (e: React.PointerEvent, id: string, title: string) => {
      if (e.button !== 0) return; // left button only — middle-click closes
      // Explicit pointer capture keeps move/up events flowing to this
      // document while the cursor is outside the OS window — WebView2 does
      // not guarantee delivery beyond the window bounds without it. Captured
      // events still bubble, so the window-level listeners below keep
      // working.
      const el = e.currentTarget as HTMLElement | undefined;
      if (el?.setPointerCapture) {
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // best-effort: the drag still works inside the window
        }
      }
      armedRef.current = { id, title, x: e.clientX, y: e.clientY };
      draggingRef.current = false;
    },
    [],
  );

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const armed = armedRef.current;
      if (!armed) return;
      if (
        !draggingRef.current &&
        exceedsDragThreshold(armed.x, armed.y, e.clientX, e.clientY)
      ) {
        draggingRef.current = true;
      }
      if (draggingRef.current) {
        setDrag({ ...armed, x: e.clientX, y: e.clientY });
      }
    };

    // A native `click` only fires when pointerdown/pointerup share the same
    // target, so a real drag (released far away, or outside the viewport)
    // never produces a click to consume `suppressNextClick` — it would
    // otherwise stay true and eat the NEXT unrelated tab click. Clearing it
    // at the start of every gesture keeps same-gesture suppression intact
    // (pointerdown clears → pointerup may set → click consumes) while
    // killing stale flags from a previous gesture. Registered on the capture
    // phase so a target's stopPropagation() can't prevent this clear.
    const onWindowPointerDown = () => {
      suppressNextClick.current = false;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return; // ignore right-click/other buttons
      const armed = armedRef.current;
      if (!armed) return;
      const wasDragging = draggingRef.current;
      const rect = getStripRectRef.current();
      const outside = rect
        ? isOutsideStrip(e.clientX, e.clientY, rect)
        : isOutsideViewport(
            e.clientX,
            e.clientY,
            window.innerWidth,
            window.innerHeight,
          );
      reset();
      if (wasDragging) {
        suppressNextClick.current = true;
        if (outside) onDetachAtCursorRef.current(armed.id);
      }
    };

    const onPointerCancel = () => {
      // System-initiated interruption (focus loss, OS gesture) — just
      // disarm, no suppress and no detach.
      reset();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && armedRef.current) {
        const wasDragging = draggingRef.current;
        reset();
        if (wasDragging) suppressNextClick.current = true;
      }
    };

    window.addEventListener("pointerdown", onWindowPointerDown, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onWindowPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [reset]);

  return { drag, handleTabPointerDown, suppressNextClick };
}
