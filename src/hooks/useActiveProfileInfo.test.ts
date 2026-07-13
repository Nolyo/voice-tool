// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

let identityHandler: (() => void) | null = null;
const unlistenMock = vi.fn();
vi.mock("@tauri-apps/api/event", () => ({
  listen: (_event: string, handler: () => void) => {
    identityHandler = handler;
    return Promise.resolve(unlistenMock);
  },
}));

import { useActiveProfileInfo } from "./useActiveProfileInfo";

const DATA_URL = "data:image/png;base64,AAAA";
const PROFILES = [
  { id: "default", name: "Default", createdAt: "" },
  { id: "perso", name: "Perso", createdAt: "" },
];

beforeEach(() => {
  invokeMock.mockReset();
  identityHandler = null;
});

describe("useActiveProfileInfo", () => {
  it("loads the active profile name and avatar", async () => {
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "get_active_profile") return "perso";
      if (cmd === "list_profiles") return PROFILES;
      if (cmd === "get_profile_avatar") return DATA_URL;
      return undefined;
    });
    const { result } = renderHook(() => useActiveProfileInfo());
    await waitFor(() => expect(result.current.name).toBe("Perso"));
    expect(result.current.avatarUrl).toBe(DATA_URL);
    expect(invokeMock).toHaveBeenCalledWith("get_profile_avatar", {
      id: "perso",
    });
  });

  it("returns a null avatarUrl for a profile without a photo", async () => {
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "get_active_profile") return "default";
      if (cmd === "list_profiles") return PROFILES;
      if (cmd === "get_profile_avatar") return null;
      return undefined;
    });
    const { result } = renderHook(() => useActiveProfileInfo());
    await waitFor(() => expect(result.current.name).toBe("Default"));
    expect(result.current.avatarUrl).toBeNull();
  });

  it("stays null on invoke failure without throwing", async () => {
    invokeMock.mockRejectedValue(new Error("ipc down"));
    const { result } = renderHook(() => useActiveProfileInfo());
    // Give the effect a tick to settle; nothing must throw or reject unhandled.
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toEqual({ name: null, avatarUrl: null });
  });

  it("reloads the identity when the main window broadcasts a change", async () => {
    let avatar: string | null = DATA_URL;
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "get_active_profile") return "perso";
      if (cmd === "list_profiles") return PROFILES;
      if (cmd === "get_profile_avatar") return avatar;
      return undefined;
    });
    const { result } = renderHook(() => useActiveProfileInfo());
    await waitFor(() => expect(result.current.avatarUrl).toBe(DATA_URL));

    avatar = null;
    expect(identityHandler).not.toBeNull();
    identityHandler!();
    await waitFor(() => expect(result.current.avatarUrl).toBeNull());
    expect(result.current.name).toBe("Perso");
  });
});
