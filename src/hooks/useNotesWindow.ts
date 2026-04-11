import { useCallback, useEffect, useRef, useState } from "react";

interface WindowPosition {
  x: number;
  y: number;
}

interface WindowSize {
  width: number;
  height: number;
}

interface UseNotesWindowOptions {
  defaultWidth: number;
  defaultHeight: number;
  minWidth?: number;
  minHeight?: number;
}

/**
 * Manage the floating notes-editor window: initial centered position,
 * drag-to-move, resize-from-corner, maximize, and half-screen modes.
 * Pure state + event listeners — no TipTap / note concerns.
 */
export function useNotesWindow({
  defaultWidth,
  defaultHeight,
  minWidth = 320,
  minHeight = 250,
}: UseNotesWindowOptions) {
  const [position, setPosition] = useState<WindowPosition>(() => ({
    x: Math.max(0, (window.innerWidth - defaultWidth) / 2),
    y: Math.max(0, (window.innerHeight - defaultHeight) / 2),
  }));
  const [size, setSize] = useState<WindowSize>({
    width: defaultWidth,
    height: defaultHeight,
  });
  const [isMaximized, setIsMaximized] = useState(false);
  const [isHalfScreen, setIsHalfScreen] = useState(false);
  const [preMaxState, setPreMaxState] = useState<{
    position: WindowPosition;
    size: WindowSize;
  } | null>(null);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
  } | null>(null);
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragRef.current) {
        e.preventDefault();
        setPosition({
          x: e.clientX - dragRef.current.startX + dragRef.current.startPosX,
          y: e.clientY - dragRef.current.startY + dragRef.current.startPosY,
        });
      }
      if (resizeRef.current) {
        e.preventDefault();
        const newW = Math.max(
          minWidth,
          resizeRef.current.startW + e.clientX - resizeRef.current.startX,
        );
        const newH = Math.max(
          minHeight,
          resizeRef.current.startH + e.clientY - resizeRef.current.startY,
        );
        setSize({ width: newW, height: newH });
      }
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [minWidth, minHeight]);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (isMaximized || isHalfScreen) return;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPosX: position.x,
        startPosY: position.y,
      };
    },
    [isMaximized, isHalfScreen, position.x, position.y],
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (isMaximized || isHalfScreen) return;
      e.stopPropagation();
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startW: size.width,
        startH: size.height,
      };
    },
    [isMaximized, isHalfScreen, size.width, size.height],
  );

  const toggleMaximize = useCallback(() => {
    if (isMaximized) {
      if (preMaxState) {
        setPosition(preMaxState.position);
        setSize(preMaxState.size);
      }
      setIsMaximized(false);
      setIsHalfScreen(false);
    } else {
      setPreMaxState({ position, size });
      setPosition({ x: 0, y: 0 });
      setSize({ width: window.innerWidth, height: window.innerHeight });
      setIsMaximized(true);
      setIsHalfScreen(false);
    }
  }, [isMaximized, preMaxState, position, size]);

  const toggleHalfScreen = useCallback(() => {
    if (isHalfScreen) {
      if (preMaxState) {
        setPosition(preMaxState.position);
        setSize(preMaxState.size);
      }
      setIsHalfScreen(false);
    } else {
      setPreMaxState({ position, size });
      const halfW = Math.round(window.innerWidth / 2);
      const halfH = Math.round(window.innerHeight * 0.75);
      setSize({ width: halfW, height: halfH });
      setPosition({
        x: Math.round((window.innerWidth - halfW) / 2),
        y: Math.round((window.innerHeight - halfH) / 2),
      });
      setIsHalfScreen(true);
      setIsMaximized(false);
    }
  }, [isHalfScreen, preMaxState, position, size]);

  return {
    position,
    size,
    isMaximized,
    isHalfScreen,
    handleDragStart,
    handleResizeStart,
    toggleMaximize,
    toggleHalfScreen,
  };
}
