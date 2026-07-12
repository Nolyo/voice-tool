// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const storeMock = {
  get: vi.fn(),
  set: vi.fn(),
  save: vi.fn(),
};
vi.mock("@tauri-apps/plugin-store", () => ({
  Store: { load: vi.fn(async () => storeMock) },
}));

import {
  useSidebarCollapseState,
  isAnyExpanded,
  type SidebarCollapseState,
} from "./useSidebarCollapseState";

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue("fake/notes-sidebar.json");
  storeMock.get.mockReset();
  storeMock.get.mockResolvedValue(undefined);
  storeMock.set.mockReset();
  storeMock.save.mockReset();
});

const collapsedState = (
  folders: Record<string, boolean> = {},
): SidebarCollapseState => ({
  favorites: true,
  recents: true,
  root: true,
  folders,
});

describe("isAnyExpanded", () => {
  it("is true for the default state (everything expanded)", () => {
    const state: SidebarCollapseState = {
      favorites: false,
      recents: false,
      root: false,
      folders: {},
    };
    expect(isAnyExpanded(state, [])).toBe(true);
  });

  it("is false when all sections are collapsed and there are no folders", () => {
    expect(isAnyExpanded(collapsedState(), [])).toBe(false);
  });

  it("is true when one section is still expanded", () => {
    expect(
      isAnyExpanded({ ...collapsedState(), recents: false }, []),
    ).toBe(true);
  });

  it("treats a folder missing from the map as expanded", () => {
    expect(isAnyExpanded(collapsedState({ f1: true }), ["f1", "f2"])).toBe(
      true,
    );
  });

  it("is false when all sections and all listed folders are collapsed", () => {
    expect(
      isAnyExpanded(collapsedState({ f1: true, f2: true }), ["f1", "f2"]),
    ).toBe(false);
  });

  it("is true when a folder is explicitly expanded (false in the map)", () => {
    expect(isAnyExpanded(collapsedState({ f1: false }), ["f1"])).toBe(true);
  });
});

describe("useSidebarCollapseState.setAll", () => {
  it("collapses the three sections and every listed folder at once", async () => {
    const { result } = renderHook(() => useSidebarCollapseState());
    await act(async () => {});
    act(() => {
      result.current.setAll(true, ["f1", "f2"]);
    });
    expect(result.current.state).toEqual({
      favorites: true,
      recents: true,
      root: true,
      folders: { f1: true, f2: true },
    });
  });

  it("expands everything back", async () => {
    const { result } = renderHook(() => useSidebarCollapseState());
    await act(async () => {});
    act(() => {
      result.current.setAll(true, ["f1"]);
    });
    act(() => {
      result.current.setAll(false, ["f1"]);
    });
    expect(result.current.state).toEqual({
      favorites: false,
      recents: false,
      root: false,
      folders: { f1: false },
    });
  });

  it("rebuilds the folders map from the given ids (stale ids are dropped)", async () => {
    const { result } = renderHook(() => useSidebarCollapseState());
    await act(async () => {});
    act(() => {
      result.current.setAll(true, ["old"]);
    });
    act(() => {
      result.current.setAll(true, ["new"]);
    });
    expect(result.current.state.folders).toEqual({ new: true });
  });
});
