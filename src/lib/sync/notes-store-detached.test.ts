import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn() }));

import {
  cancelNoteUpdatePush,
  scheduleNoteUpdatePushFromDisk,
} from "./notes-store";

describe("scheduleNoteUpdatePushFromDisk", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({
      meta: { id: "n1", title: "T", updatedAt: "2026-07-24T00:00:00Z" },
      content: "<p>x</p>",
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the note from disk only when the debounce fires", async () => {
    scheduleNoteUpdatePushFromDisk("n1", 2000);
    expect(invokeMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(invokeMock).toHaveBeenCalledWith("read_note", { id: "n1" });
  });

  it("coalesces rapid re-schedules into a single read", async () => {
    scheduleNoteUpdatePushFromDisk("n1", 2000);
    await vi.advanceTimersByTimeAsync(1000);
    scheduleNoteUpdatePushFromDisk("n1", 2000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("cancelNoteUpdatePush drops the pending push", async () => {
    scheduleNoteUpdatePushFromDisk("n1", 2000);
    cancelNoteUpdatePush("n1");
    await vi.advanceTimersByTimeAsync(3000);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
