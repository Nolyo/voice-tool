import { describe, it, expect, vi, beforeEach } from "vitest";

const clearedPaths: string[] = [];
const invokeCalls: string[] = [];

vi.mock("@tauri-apps/plugin-store", () => ({
  Store: {
    load: vi.fn(async (path: string) => ({
      _path: path,
      clear: async () => { clearedPaths.push(path); },
      save: async () => {},
    })),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => { invokeCalls.push(cmd); return 0; }),
}));

import { purgeLocalCloudData } from "./local-purge";

describe("purgeLocalCloudData", () => {
  beforeEach(() => {
    clearedPaths.length = 0;
    invokeCalls.length = 0;
  });

  it("clears all sync stores and calls delete_all_local_backups", async () => {
    await purgeLocalCloudData();
    expect(clearedPaths.sort()).toEqual([
      "sync-dictionary.json",
      "sync-meta.json",
      "sync-queue.json",
      "sync-snippets.json",
    ]);
    expect(invokeCalls).toEqual(["delete_all_local_backups"]);
  });
});
