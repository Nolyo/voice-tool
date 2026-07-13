// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { ProfilesProvider, useProfiles } from "./ProfilesContext";

const DATA_URL = "data:image/png;base64,AAAA";
const NEW_URL = "data:image/png;base64,BBBB";

function mockBackend() {
  invokeMock.mockImplementation(async (cmd: unknown, args?: unknown) => {
    if (cmd === "list_profiles")
      return [
        { id: "default", name: "Default", createdAt: "" },
        { id: "work", name: "Work", createdAt: "" },
      ];
    if (cmd === "get_active_profile") return "default";
    if (cmd === "get_profile_avatar")
      return (args as { id: string }).id === "default" ? DATA_URL : null;
    return undefined;
  });
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <ProfilesProvider>{children}</ProfilesProvider>
);

beforeEach(() => {
  invokeMock.mockReset();
  mockBackend();
});

describe("ProfilesContext avatars", () => {
  it("loads avatars on mount, skipping profiles without one", async () => {
    const { result } = renderHook(() => useProfiles(), { wrapper });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.avatars).toEqual({ default: DATA_URL });
  });

  it("setProfileAvatar invokes the command and stores the data-URL", async () => {
    const { result } = renderHook(() => useProfiles(), { wrapper });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    await act(() => result.current.setProfileAvatar("work", NEW_URL));

    expect(invokeMock).toHaveBeenCalledWith("set_profile_avatar", {
      id: "work",
      dataUrl: NEW_URL,
    });
    expect(result.current.avatars.work).toBe(NEW_URL);
  });

  it("clearProfileAvatar invokes the command and drops the entry", async () => {
    const { result } = renderHook(() => useProfiles(), { wrapper });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    await act(() => result.current.clearProfileAvatar("default"));

    expect(invokeMock).toHaveBeenCalledWith("clear_profile_avatar", {
      id: "default",
    });
    expect(result.current.avatars).toEqual({});
  });
});
