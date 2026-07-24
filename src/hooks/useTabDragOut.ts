import { useCallback, useEffect, useRef, useState } from "react";
import {
  exceedsDragThreshold,
  isOutsideViewport,
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
 * threshold a ghost follows the cursor; releasing OUTSIDE the viewport
 * detaches the note at the OS cursor position (Rust resolves the physical
 * coordinates — no DPI math here). Releasing inside, or pressing Escape,
 * cancels. A completed drag suppresses the click that follows it so the tab
 * doesn't also activate.
 */
export function useTabDragOut({
  onDetachAtCursor,
}: {
  onDetachAtCursor: (id: string) => void;
}) {
  const [drag, setDrag] = useState<TabDragState | null>(null);
  const armedRef = useRef<TabDragState | null>(null);
  const draggingRef = useRef(false);
  const suppressNextClick = useRef(false);

  const reset = useCallback(() => {
    armedRef.current = null;
    draggingRef.current = false;
    setDrag(null);
  }, []);

  const handleTabPointerDown = useCallback(
    (e: React.PointerEvent, id: string, title: string) => {
      if (e.button !== 0) return; // left button only — middle-click closes
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

    const onPointerUp = (e: PointerEvent) => {
      const armed = armedRef.current;
      if (!armed) return;
      const wasDragging = draggingRef.current;
      const outside = isOutsideViewport(
        e.clientX,
        e.clientY,
        window.innerWidth,
        window.innerHeight,
      );
      reset();
      if (wasDragging) {
        suppressNextClick.current = true;
        if (outside) onDetachAtCursor(armed.id);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && armedRef.current) {
        reset();
        suppressNextClick.current = true;
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onDetachAtCursor, reset]);

  return { drag, handleTabPointerDown, suppressNextClick };
}
