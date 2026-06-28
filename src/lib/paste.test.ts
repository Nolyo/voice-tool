import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
const readTextMock = vi.fn();
const writeTextMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  readText: (...args: unknown[]) => readTextMock(...args),
  writeText: (...args: unknown[]) => writeTextMock(...args),
}));

import { pasteTextPreservingClipboard } from "./paste";

describe("pasteTextPreservingClipboard", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    readTextMock.mockReset();
    writeTextMock.mockReset();
  });

  it("writes the text, pastes it, then restores the previous clipboard", async () => {
    readTextMock.mockResolvedValue("PREVIOUS");
    invokeMock.mockResolvedValue(undefined);
    writeTextMock.mockResolvedValue(undefined);

    await pasteTextPreservingClipboard("hello world");

    expect(writeTextMock).toHaveBeenNthCalledWith(1, "hello world");
    expect(invokeMock).toHaveBeenCalledWith("paste_text_to_active_window", {
      text: "hello world",
    });
    expect(writeTextMock).toHaveBeenNthCalledWith(2, "PREVIOUS");
  });

  it("still pastes when the previous clipboard can't be read", async () => {
    readTextMock.mockRejectedValue(new Error("not text"));
    invokeMock.mockResolvedValue(undefined);
    writeTextMock.mockResolvedValue(undefined);

    await pasteTextPreservingClipboard("abc");

    expect(writeTextMock).toHaveBeenCalledWith("abc");
    expect(invokeMock).toHaveBeenCalledWith("paste_text_to_active_window", {
      text: "abc",
    });
    expect(writeTextMock).toHaveBeenCalledTimes(1);
  });
});
