// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useGuidedTour } from "./useGuidedTour";

describe("useGuidedTour", () => {
  it("starts at index 0", () => {
    const { result } = renderHook(() => useGuidedTour(3, vi.fn()));
    expect(result.current.index).toBe(0);
    expect(result.current.isFirst).toBe(true);
    expect(result.current.isLast).toBe(false);
  });

  it("advances with next() and clamps isLast", () => {
    const { result } = renderHook(() => useGuidedTour(3, vi.fn()));
    act(() => result.current.next());
    expect(result.current.index).toBe(1);
    act(() => result.current.next());
    expect(result.current.index).toBe(2);
    expect(result.current.isLast).toBe(true);
  });

  it("calls onFinish when next() is invoked on the last step and does not overflow", () => {
    const onFinish = vi.fn();
    const { result } = renderHook(() => useGuidedTour(2, onFinish));
    act(() => result.current.next()); // → index 1 (last)
    act(() => result.current.next()); // → onFinish, stays at 1
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(result.current.index).toBe(1);
  });

  it("prev() decrements and clamps at 0", () => {
    const { result } = renderHook(() => useGuidedTour(3, vi.fn()));
    act(() => result.current.next());
    act(() => result.current.prev());
    expect(result.current.index).toBe(0);
    act(() => result.current.prev());
    expect(result.current.index).toBe(0);
  });

  it("reset() returns to 0", () => {
    const { result } = renderHook(() => useGuidedTour(3, vi.fn()));
    act(() => result.current.next());
    act(() => result.current.reset());
    expect(result.current.index).toBe(0);
  });
});
