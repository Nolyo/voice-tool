// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useTabDragOut } from "./useTabDragOut";

/** jsdom may not implement PointerEvent; MouseEvent carries the same
 *  clientX/clientY fields and window listeners don't care about the
 *  concrete event class, only the type string and those fields. */
function pointerEvent(
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  init: { clientX?: number; clientY?: number; button?: number } = {},
) {
  const Ctor =
    typeof PointerEvent !== "undefined" ? PointerEvent : MouseEvent;
  return new Ctor(type, {
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
    button: init.button ?? 0,
    bubbles: true,
    cancelable: true,
  });
}

function dispatch(
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  init?: { clientX?: number; clientY?: number; button?: number },
) {
  window.dispatchEvent(pointerEvent(type, init));
}

function makeReactPointerDownEvent(
  init: { clientX?: number; clientY?: number; button?: number } = {},
) {
  return {
    button: init.button ?? 0,
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
  } as unknown as React.PointerEvent;
}

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { value: 1000, writable: true, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 800, writable: true, configurable: true });
});

/** Tab bar occupies the top 30px of the 1000x800 viewport. */
const STRIP = { left: 0, top: 0, right: 1000, bottom: 30 };
const getStripRect = () => STRIP;

describe("useTabDragOut", () => {
  it("completed drag released outside the window detaches and suppresses the next click", () => {
    const onDetachAtCursor = vi.fn();
    const { result } = renderHook(() => useTabDragOut({ onDetachAtCursor, getStripRect }));

    act(() => {
      result.current.handleTabPointerDown(
        makeReactPointerDownEvent({ clientX: 10, clientY: 10 }),
        "note-1",
        "Title 1",
      );
    });
    act(() => {
      dispatch("pointermove", { clientX: 100, clientY: 10 }); // past 6px threshold
    });
    act(() => {
      dispatch("pointerup", { clientX: -50, clientY: 10 }); // outside viewport
    });

    expect(onDetachAtCursor).toHaveBeenCalledTimes(1);
    expect(onDetachAtCursor).toHaveBeenCalledWith("note-1");
    expect(result.current.suppressNextClick.current).toBe(true);
  });

  it("release ON the tab bar after dragging cancels (no detach) but still suppresses", () => {
    const onDetachAtCursor = vi.fn();
    const { result } = renderHook(() => useTabDragOut({ onDetachAtCursor, getStripRect }));

    act(() => {
      result.current.handleTabPointerDown(
        makeReactPointerDownEvent({ clientX: 10, clientY: 10 }),
        "note-1",
        "Title 1",
      );
    });
    act(() => {
      dispatch("pointermove", { clientX: 100, clientY: 10 });
    });
    act(() => {
      dispatch("pointerup", { clientX: 500, clientY: 15 }); // on the tab bar
    });

    expect(onDetachAtCursor).not.toHaveBeenCalled();
    expect(result.current.suppressNextClick.current).toBe(true);
  });

  it("release below the tab bar but inside the window detaches (Notepad-style — works maximized)", () => {
    const onDetachAtCursor = vi.fn();
    const { result } = renderHook(() => useTabDragOut({ onDetachAtCursor, getStripRect }));

    act(() => {
      result.current.handleTabPointerDown(
        makeReactPointerDownEvent({ clientX: 10, clientY: 10 }),
        "note-1",
        "Title 1",
      );
    });
    act(() => {
      dispatch("pointermove", { clientX: 100, clientY: 100 });
    });
    act(() => {
      dispatch("pointerup", { clientX: 200, clientY: 200 }); // inside viewport, off the bar
    });

    expect(onDetachAtCursor).toHaveBeenCalledTimes(1);
    expect(onDetachAtCursor).toHaveBeenCalledWith("note-1");
    expect(result.current.suppressNextClick.current).toBe(true);
  });

  it("falls back to the outside-viewport criterion when no strip rect is available", () => {
    const onDetachAtCursor = vi.fn();
    const { result } = renderHook(() =>
      useTabDragOut({ onDetachAtCursor, getStripRect: () => null }),
    );

    act(() => {
      result.current.handleTabPointerDown(
        makeReactPointerDownEvent({ clientX: 10, clientY: 10 }),
        "note-1",
        "Title 1",
      );
    });
    act(() => {
      dispatch("pointermove", { clientX: 100, clientY: 100 });
    });
    act(() => {
      dispatch("pointerup", { clientX: 200, clientY: 200 }); // inside viewport
    });

    expect(onDetachAtCursor).not.toHaveBeenCalled();
  });

  it("a fresh pointerdown anywhere clears a stale suppressNextClick", () => {
    const onDetachAtCursor = vi.fn();
    const { result } = renderHook(() => useTabDragOut({ onDetachAtCursor, getStripRect }));

    // Simulate a stale flag left over from a previous drag whose click
    // never fired (released far from the original target).
    act(() => {
      result.current.suppressNextClick.current = true;
    });

    act(() => {
      dispatch("pointerdown", { clientX: 500, clientY: 500 });
    });

    expect(result.current.suppressNextClick.current).toBe(false);
  });

  it("a non-left-button pointerup while dragging does not end the drag; a later left release still works", () => {
    const onDetachAtCursor = vi.fn();
    const { result } = renderHook(() => useTabDragOut({ onDetachAtCursor, getStripRect }));

    act(() => {
      result.current.handleTabPointerDown(
        makeReactPointerDownEvent({ clientX: 10, clientY: 10 }),
        "note-1",
        "Title 1",
      );
    });
    act(() => {
      dispatch("pointermove", { clientX: 100, clientY: 10 });
    });
    act(() => {
      dispatch("pointerup", { clientX: -50, clientY: 10, button: 2 }); // right-click release
    });

    expect(onDetachAtCursor).not.toHaveBeenCalled();
    expect(result.current.drag).not.toBeNull(); // drag still armed/active

    act(() => {
      dispatch("pointerup", { clientX: -50, clientY: 10, button: 0 }); // real left release
    });

    expect(onDetachAtCursor).toHaveBeenCalledTimes(1);
    expect(onDetachAtCursor).toHaveBeenCalledWith("note-1");
  });

  it("pointercancel resets without detaching and without suppressing", () => {
    const onDetachAtCursor = vi.fn();
    const { result } = renderHook(() => useTabDragOut({ onDetachAtCursor, getStripRect }));

    act(() => {
      result.current.handleTabPointerDown(
        makeReactPointerDownEvent({ clientX: 10, clientY: 10 }),
        "note-1",
        "Title 1",
      );
    });
    act(() => {
      dispatch("pointermove", { clientX: 100, clientY: 10 });
    });
    act(() => {
      dispatch("pointercancel", { clientX: 100, clientY: 10 });
    });

    expect(onDetachAtCursor).not.toHaveBeenCalled();
    expect(result.current.suppressNextClick.current).toBe(false);
    expect(result.current.drag).toBeNull();

    // A later pointerup should not misfire since the gesture was reset.
    act(() => {
      dispatch("pointerup", { clientX: -50, clientY: 10 });
    });
    expect(onDetachAtCursor).not.toHaveBeenCalled();
  });

  it("Escape while merely armed (no movement past threshold) does not suppress", () => {
    const onDetachAtCursor = vi.fn();
    const { result } = renderHook(() => useTabDragOut({ onDetachAtCursor, getStripRect }));

    act(() => {
      result.current.handleTabPointerDown(
        makeReactPointerDownEvent({ clientX: 10, clientY: 10 }),
        "note-1",
        "Title 1",
      );
    });
    // No pointermove past the threshold — gesture is armed but not dragging.
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(onDetachAtCursor).not.toHaveBeenCalled();
    expect(result.current.suppressNextClick.current).toBe(false);
    expect(result.current.drag).toBeNull();
  });

  it("Escape while dragging (past threshold) suppresses, resets the ghost, and prevents a later detach", () => {
    const onDetachAtCursor = vi.fn();
    const { result } = renderHook(() => useTabDragOut({ onDetachAtCursor, getStripRect }));

    act(() => {
      result.current.handleTabPointerDown(
        makeReactPointerDownEvent({ clientX: 10, clientY: 10 }),
        "note-1",
        "Title 1",
      );
    });
    act(() => {
      dispatch("pointermove", { clientX: 100, clientY: 10 }); // past 6px threshold
    });
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(result.current.suppressNextClick.current).toBe(true);
    expect(result.current.drag).toBeNull();

    // The gesture was reset, so a later left release outside the viewport
    // must not be treated as a completed drag.
    act(() => {
      dispatch("pointerup", { clientX: -50, clientY: 10 });
    });
    expect(onDetachAtCursor).not.toHaveBeenCalled();
  });
});
