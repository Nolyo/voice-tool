# Sync Profile Isolation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the cloud sync engine respect the "mono-profil — only the active profile syncs" decision (ADR 0016 §10 / ADR 0010) so that notes/folders from a non-syncing profile can never leak into another profile's sync queue and reach the cloud.

**Architecture:** The sync queue and sync-meta stores currently live at the app-data root (`com.nolyo.lexena/sync-*.json`), shared across every profile, while notes/folders live per-profile (`profiles/<id>/notes/`). Push-on-mutate (`notes-store`, `folders-store`) enqueues unconditionally. The fix: (1) move `sync-queue.json` + `sync-meta.json` under `profiles/<id>/` so the `enabled` flag and the queue are per-profile, structurally preventing cross-profile contamination; (2) add a process-wide sync-gate so inline enqueue is a no-op unless sync is active for the running profile; (3) a one-time startup migration that deletes the contaminated legacy root sync stores. `switch_profile` restarts the app, so one OS process = exactly one active profile — the cached store path is safe.

**Tech Stack:** Tauri 2 (Rust), `@tauri-apps/plugin-store`, React 19 + TypeScript, Vitest, `cargo test`.

## Global Constraints

- Snippets and the dictionary are **global** features (stored only at root: `sync-snippets.json`, `sync-dictionary.json`). Do NOT move those two stores per-profile — they stay global. Only `sync-queue.json` and `sync-meta.json` move per-profile.
- Never break existing dependencies; no `cargo update`, no changes to existing crate features (per `feedback_no_breaking_deps`).
- `cargo check`/`cargo test` on Windows require `LIBCLANG_PATH="C:/Program Files/LLVM/bin"` and CMake on PATH (`export PATH="$PATH:/c/Program Files/CMake/bin"`).
- PowerShell is the default shell; use `$env:VAR = "..."` not `VAR=val cmd` when running commands outside the Bash tool.
- All UI strings go through i18n (none are added by this plan, but keep the rule in mind).
- Commit messages in English, conventional-commits format.
- The per-profile store path convention is `profiles/<id>/<filename>` returned by a Rust command and passed to `Store.load(path)` — mirror the existing `get_active_profile_settings_path` pattern exactly.

---

### Task 1: Rust — per-profile sync store path helpers + commands

**Files:**
- Modify: `src-tauri/src/profiles.rs` (add pure helper + 2 path fns near `settings_store_path`, ~line 57-73)
- Modify: `src-tauri/src/commands/profiles.rs` (add 2 commands near `get_active_profile_settings_path`, ~line 24)
- Modify: `src-tauri/src/lib.rs` (register 2 commands in the `invoke_handler` list, ~line 161)
- Test: `src-tauri/src/profiles.rs` (`#[cfg(test)]` module at end of file)

**Interfaces:**
- Produces: Rust `pub fn profile_store_path(id: &str, filename: &str) -> String`, `pub fn sync_meta_store_path(app: &AppHandle) -> String`, `pub fn sync_queue_store_path(app: &AppHandle) -> String`; Tauri commands `get_active_profile_sync_meta_path() -> Result<String, String>` and `get_active_profile_sync_queue_path() -> Result<String, String>`, both returning the relative path `profiles/<active-id>/sync-meta.json` (resp. `sync-queue.json`).

- [ ] **Step 1: Write the failing test**

Add at the end of `src-tauri/src/profiles.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::profile_store_path;

    #[test]
    fn profile_store_path_joins_id_and_filename() {
        assert_eq!(
            profile_store_path("work", "sync-queue.json"),
            "profiles/work/sync-queue.json"
        );
        assert_eq!(
            profile_store_path("default", "sync-meta.json"),
            "profiles/default/sync-meta.json"
        );
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$PATH:/c/Program Files/CMake/bin"; LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo test -p lexena_lib profile_store_path_joins_id_and_filename`
Expected: FAIL — `cannot find function profile_store_path in this scope`.

- [ ] **Step 3: Write minimal implementation**

In `src-tauri/src/profiles.rs`, right above `settings_store_path` (line ~57), add:

```rust
/// Build a per-profile store path relative to app_data_dir. Pure (testable).
pub fn profile_store_path(id: &str, filename: &str) -> String {
    format!("profiles/{}/{}", id, filename)
}

/// Return the sync-meta store path for the active profile (relative to app_data_dir)
pub fn sync_meta_store_path(app: &AppHandle) -> String {
    profile_store_path(&get_active_id(app), "sync-meta.json")
}

/// Return the sync-queue store path for the active profile (relative to app_data_dir)
pub fn sync_queue_store_path(app: &AppHandle) -> String {
    profile_store_path(&get_active_id(app), "sync-queue.json")
}
```

In `src-tauri/src/commands/profiles.rs`, right after `get_active_profile_settings_path` (line ~27), add:

```rust
/// Get the sync-meta store path for the active profile (for frontend Store.load)
#[tauri::command]
pub fn get_active_profile_sync_meta_path(app: AppHandle) -> Result<String, String> {
    Ok(crate::profiles::sync_meta_store_path(&app))
}

/// Get the sync-queue store path for the active profile (for frontend Store.load)
#[tauri::command]
pub fn get_active_profile_sync_queue_path(app: AppHandle) -> Result<String, String> {
    Ok(crate::profiles::sync_queue_store_path(&app))
}
```

In `src-tauri/src/lib.rs`, in the `tauri::generate_handler!` list, after `commands::profiles::get_active_profile_notes_sidebar_path,` (line ~164) add:

```rust
            commands::profiles::get_active_profile_sync_meta_path,
            commands::profiles::get_active_profile_sync_queue_path,
```

- [ ] **Step 4: Run test + cargo check to verify it passes**

Run: `export PATH="$PATH:/c/Program Files/CMake/bin"; LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo test -p lexena_lib profile_store_path_joins_id_and_filename && LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo check`
Expected: test PASS, `cargo check` clean.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/profiles.rs src-tauri/src/commands/profiles.rs src-tauri/src/lib.rs
git commit -m "feat(sync): add per-profile sync-meta + sync-queue store path commands"
```

---

### Task 2: Rust — one-time cleanup of contaminated legacy root sync stores

**Files:**
- Modify: `src-tauri/src/profiles.rs` (add `cleanup_legacy_root_sync_stores_in` pure-ish fn + `cleanup_legacy_root_sync_stores` wrapper)
- Modify: `src-tauri/src/lib.rs` (call wrapper in `setup`, right after `init_active_profile`, ~line 213)
- Test: `src-tauri/src/profiles.rs` (`#[cfg(test)]` module)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: Rust `pub fn cleanup_legacy_root_sync_stores_in(app_data: &std::path::Path) -> std::io::Result<()>` — deletes `app_data/sync-queue.json` and `app_data/sync-meta.json` if present, leaves `sync-snippets.json` / `sync-dictionary.json` untouched; `pub fn cleanup_legacy_root_sync_stores(app: &AppHandle) -> anyhow::Result<()>` wrapper.

**Why:** The legacy root `sync-queue.json` holds 154 cross-profile `note-upsert` ops (the bug); the legacy root `sync-meta.json` holds a global `enabled=true`. After this fix, sync state is per-profile, so the root copies are stale and the queue is poisoned. Deleting both forces the user to re-enable sync once (acceptable: sync is an unreleased beta), after which `enableSync`'s full push repopulates the active profile's queue correctly. Snippets/dictionary stores are global by design and must survive.

- [ ] **Step 1: Write the failing test**

Add to the `#[cfg(test)] mod tests` in `src-tauri/src/profiles.rs`:

```rust
    use super::cleanup_legacy_root_sync_stores_in;
    use std::fs;

    #[test]
    fn cleanup_removes_only_legacy_queue_and_meta() {
        let dir = std::env::temp_dir().join(format!(
            "lexena_cleanup_test_{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        for f in ["sync-queue.json", "sync-meta.json", "sync-snippets.json", "sync-dictionary.json"] {
            fs::write(dir.join(f), "{}").unwrap();
        }

        cleanup_legacy_root_sync_stores_in(&dir).unwrap();

        assert!(!dir.join("sync-queue.json").exists(), "queue should be deleted");
        assert!(!dir.join("sync-meta.json").exists(), "meta should be deleted");
        assert!(dir.join("sync-snippets.json").exists(), "snippets must survive");
        assert!(dir.join("sync-dictionary.json").exists(), "dictionary must survive");

        // Idempotent: second run with files already gone must not error.
        cleanup_legacy_root_sync_stores_in(&dir).unwrap();

        let _ = fs::remove_dir_all(&dir);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$PATH:/c/Program Files/CMake/bin"; LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo test -p lexena_lib cleanup_removes_only_legacy`
Expected: FAIL — `cannot find function cleanup_legacy_root_sync_stores_in`.

- [ ] **Step 3: Write minimal implementation**

In `src-tauri/src/profiles.rs`, add near the other migration fns (after `migrate_legacy_to_default`):

```rust
/// Delete the contaminated legacy root sync stores (sync-queue.json, sync-meta.json).
/// These predate per-profile sync isolation. Snippets/dictionary stores are global
/// and intentionally left in place. Idempotent.
pub fn cleanup_legacy_root_sync_stores_in(app_data: &std::path::Path) -> std::io::Result<()> {
    for name in ["sync-queue.json", "sync-meta.json"] {
        let p = app_data.join(name);
        if p.exists() {
            match fs::remove_file(&p) {
                Ok(_) => tracing::info!("Removed legacy root sync store: {}", name),
                Err(e) => tracing::warn!("Could not remove legacy {} ({}), skipping", name, e),
            }
        }
    }
    Ok(())
}

pub fn cleanup_legacy_root_sync_stores(app: &AppHandle) -> Result<()> {
    let app_data = app
        .path()
        .app_data_dir()
        .context("Could not resolve app data directory")?;
    cleanup_legacy_root_sync_stores_in(&app_data)?;
    Ok(())
}
```

In `src-tauri/src/lib.rs` `setup`, right after the `init_active_profile` block (~line 213-215), add:

```rust
            if let Err(e) = profiles::cleanup_legacy_root_sync_stores(app.handle()) {
                tracing::warn!("Legacy root sync store cleanup failed: {}", e);
            }
```

- [ ] **Step 4: Run test + cargo check to verify it passes**

Run: `export PATH="$PATH:/c/Program Files/CMake/bin"; LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo test -p lexena_lib cleanup_removes_only_legacy && LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo check`
Expected: test PASS, `cargo check` clean.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/profiles.rs src-tauri/src/lib.rs
git commit -m "feat(sync): purge contaminated legacy root sync stores on startup"
```

---

### Task 3: TS — sync-gate module (process-wide enqueue gate)

**Files:**
- Create: `src/lib/sync/sync-gate.ts`
- Test: `src/lib/sync/sync-gate.test.ts`

**Interfaces:**
- Produces: `setSyncActive(active: boolean): void`, `isSyncActive(): boolean`, `__resetForTests(): void`. Default state is `false` (inert) until `SyncContext` flips it on mount.

- [ ] **Step 1: Write the failing test**

Create `src/lib/sync/sync-gate.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { setSyncActive, isSyncActive, __resetForTests } from "./sync-gate";

describe("sync-gate", () => {
  beforeEach(() => __resetForTests());

  it("is inactive by default", () => {
    expect(isSyncActive()).toBe(false);
  });

  it("reflects setSyncActive", () => {
    setSyncActive(true);
    expect(isSyncActive()).toBe(true);
    setSyncActive(false);
    expect(isSyncActive()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/sync/sync-gate.test.ts`
Expected: FAIL — cannot resolve `./sync-gate`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/sync/sync-gate.ts`:

```ts
/**
 * Process-wide sync gate. `switch_profile` restarts the app, so one OS process
 * serves exactly one active profile; SyncContext sets this once the `enabled`
 * flag for the running profile is known. Inline enqueue paths (notes-store,
 * folders-store) consult `isSyncActive()` so mutations in a profile where sync
 * is off never touch the queue. Cf. ADR 0016 §10 (sync mono-profil).
 */
let active = false;

export function setSyncActive(value: boolean): void {
  active = value;
}

export function isSyncActive(): boolean {
  return active;
}

export function __resetForTests(): void {
  active = false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/sync/sync-gate.test.ts`
Expected: PASS (3 assertions across 2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/sync-gate.ts src/lib/sync/sync-gate.test.ts
git commit -m "feat(sync): add process-wide sync-gate for profile-scoped enqueue"
```

---

### Task 4: TS — queue.ts loads per-profile path

**Files:**
- Modify: `src/lib/sync/queue.ts` (lines 1-19: imports + `getStore`)
- Test: `src/lib/sync/queue.test.ts` (extend the existing `vi.mock` block, lines 3-15)

**Interfaces:**
- Consumes: Rust command `get_active_profile_sync_queue_path` (Task 1).
- Produces: unchanged public queue API (`enqueue`, `peekAll`, … `__resetForTests`). Internally `getStore()` now resolves the path via `invoke`.

- [ ] **Step 1: Write the failing test**

In `src/lib/sync/queue.test.ts`, replace the mock block (lines 1-15) with one that also mocks `invoke` and asserts the queue store path is requested:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const storeData: Record<string, unknown> = {};
const invokeMock = vi.fn(async (cmd: string) => {
  if (cmd === "get_active_profile_sync_queue_path") {
    return "profiles/default/sync-queue.json";
  }
  throw new Error(`unexpected invoke ${cmd}`);
});
vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string) => invokeMock(cmd) }));
vi.mock("@tauri-apps/plugin-store", () => {
  return {
    Store: {
      load: async (path: string) => {
        // record the resolved path for assertion
        storeData.__path = path;
        return {
          get: async (k: string) => storeData[k] ?? null,
          set: async (k: string, v: unknown) => {
            storeData[k] = v;
          },
          save: async () => {},
        };
      },
    },
  };
});
```

Then add this test inside `describe("sync queue", …)`:

```ts
  it("loads the per-profile queue store path", async () => {
    await size();
    expect(invokeMock).toHaveBeenCalledWith("get_active_profile_sync_queue_path");
    expect(storeData.__path).toBe("profiles/default/sync-queue.json");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/sync/queue.test.ts`
Expected: FAIL — `invokeMock` not called / `__path` is `sync-queue.json` (old fixed name), because `getStore` still calls `Store.load("sync-queue.json")`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/sync/queue.ts`, change the top of the file (lines 1-19):

```ts
import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import type { SyncOperation, SyncQueueEntry } from "./types";
import { createMutex } from "./_mutex";

const KEY_QUEUE = "queue";
const KEY_DLQ = "dead-letters";

export const MAX_RETRIES_BEFORE_DLQ = 5;

let storePromise: Promise<Awaited<ReturnType<typeof Store.load>>> | null = null;
const withLock = createMutex();

function getStore() {
  if (!storePromise) {
    storePromise = (async () => {
      const path = await invoke<string>("get_active_profile_sync_queue_path");
      return Store.load(path);
    })();
  }
  return storePromise;
}

export function __resetForTests() {
  storePromise = null;
}
```

(Delete the old `const STORE_FILE = "sync-queue.json";` line.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/sync/queue.test.ts`
Expected: PASS (existing tests + the new path test). `beforeEach` already calls `__resetForTests()`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/queue.ts src/lib/sync/queue.test.ts
git commit -m "feat(sync): load sync queue from per-profile store path"
```

---

### Task 5: TS — gate notes-store + folders-store enqueue on isSyncActive()

**Files:**
- Modify: `src/lib/sync/notes-store.ts` (the 4 inline `enqueue(...)` sites: `createNoteSynced`, `updateNoteSynced`, `deleteNoteSynced`, `pushNoteUpdate`, `toggleNoteFavoriteSynced`, `moveNoteToFolderSynced`)
- Modify: `src/lib/sync/folders-store.ts` (`createFolderSynced`, `renameFolderSynced`, `deleteFolderSynced`)
- Test: `src/lib/sync/notes-store.test.ts`, `src/lib/sync/folders-store.test.ts`

**Interfaces:**
- Consumes: `isSyncActive` from `./sync-gate` (Task 3).
- Produces: the `*Synced` mutators still perform the local Rust write unconditionally; they only `enqueue` when `isSyncActive()` is true.

- [ ] **Step 1: Write the failing test (notes-store)**

In `src/lib/sync/notes-store.test.ts`, add a mock for the gate near the other `vi.mock` calls:

```ts
let gateActive = true;
vi.mock("./sync-gate", () => ({ isSyncActive: () => gateActive }));
```

Then add tests (place after the existing `createNoteSynced` tests; reuse the file's `invokeHandlers` + `enqueueMock` harness):

```ts
  it("does NOT enqueue when sync gate is inactive", async () => {
    gateActive = false;
    invokeHandlers["create_note"] = () => ({
      id: "n1", title: "", folderId: null, favorite: false, order: 0,
      createdAt: "2026-06-23T00:00:00Z", updatedAt: "2026-06-23T00:00:00Z", deletedAt: null,
    });
    enqueueMock.mockClear();
    await createNoteSynced(null);
    expect(enqueueMock).not.toHaveBeenCalled();
    gateActive = true; // restore for other tests
  });

  it("DOES enqueue when sync gate is active", async () => {
    gateActive = true;
    invokeHandlers["create_note"] = () => ({
      id: "n2", title: "", folderId: null, favorite: false, order: 0,
      createdAt: "2026-06-23T00:00:00Z", updatedAt: "2026-06-23T00:00:00Z", deletedAt: null,
    });
    enqueueMock.mockClear();
    await createNoteSynced(null);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });
```

(If `LocalNoteMeta` field names differ from the above, copy them from an existing passing test in the same file rather than guessing.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/sync/notes-store.test.ts`
Expected: FAIL — "does NOT enqueue" fails because enqueue is currently unconditional.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/sync/notes-store.ts`, add to imports (after line 5):

```ts
import { isSyncActive } from "./sync-gate";
```

Then wrap each `enqueue(...)` call so it only runs when active. Replace each `try { await enqueue({...}); } catch (e) { ... }` body so the `enqueue` line is guarded. Concretely, every one of the 6 enqueue sites becomes:

```ts
  try {
    if (isSyncActive()) {
      await enqueue({ /* same op as before */ });
    }
  } catch (e) {
    console.warn("[notes-store] enqueue failed for <site>", e);
  }
```

Apply to: `createNoteSynced` (line ~42), `updateNoteSynced` (~56), `deleteNoteSynced` (~66), `pushNoteUpdate` (~85), `toggleNoteFavoriteSynced` (~157), `moveNoteToFolderSynced` (~177). Keep each op payload exactly as it is today. For `toggleNoteFavoriteSynced` / `moveNoteToFolderSynced`, also skip the extra `read_note` content fetch when inactive by putting the whole `try` body (read + enqueue) under the `isSyncActive()` guard:

```ts
  try {
    if (isSyncActive()) {
      const { content } = await invoke<{ meta: LocalNoteMeta; content: string }>(
        "read_note",
        { id }
      );
      await enqueue({ kind: "note-upsert", note: mapNoteToCloud(meta, content) });
    }
  } catch (e) {
    console.warn("[notes-store] enqueue failed for toggle-favorite", e);
  }
```

- [ ] **Step 4: Write + run the folders-store test, then implement**

In `src/lib/sync/folders-store.test.ts`, add the same gate mock (`let gateActive = true; vi.mock("./sync-gate", () => ({ isSyncActive: () => gateActive }));`) and a test asserting `createFolderSynced` does not call `enqueueMock` when `gateActive = false`. Mirror the notes-store test using the folders-store harness.

Then in `src/lib/sync/folders-store.ts` add `import { isSyncActive } from "./sync-gate";` (after line 5) and guard the 3 enqueue sites (`createFolderSynced` ~27, `renameFolderSynced` ~40, `deleteFolderSynced` ~50) with `if (isSyncActive()) { await enqueue({...}); }`.

Run: `pnpm exec vitest run src/lib/sync/notes-store.test.ts src/lib/sync/folders-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/notes-store.ts src/lib/sync/notes-store.test.ts src/lib/sync/folders-store.ts src/lib/sync/folders-store.test.ts
git commit -m "fix(sync): gate notes/folders enqueue on active sync profile"
```

---

### Task 6: TS — SyncContext uses per-profile meta + drives the sync-gate

**Files:**
- Modify: `src/contexts/SyncContext.tsx` (meta store loader lines 55-94; the mount effect ~116-126; `enableSync`/`disableSync`)

**Interfaces:**
- Consumes: Rust command `get_active_profile_sync_meta_path` (Task 1); `setSyncActive` from `@/lib/sync/sync-gate` (Task 3).
- Produces: `getMeta`/`setMeta` now read/write `profiles/<id>/sync-meta.json`; the sync-gate is set to the loaded `enabled` value on mount and updated in `enableSync` (true) / `disableSync` (false).

**Why:** Moving meta per-profile makes the `enabled` flag itself profile-scoped (enabling sync in "perso" no longer reads as enabled in "work"). Driving the gate from the same `enabled` value keeps inline enqueue and the React effects consistent.

- [ ] **Step 1: Replace the meta store helpers**

In `src/contexts/SyncContext.tsx`, change the constant (line 55) and the helpers (85-94):

```ts
const SYNC_META_FILE = "sync-meta.json"; // resolved to profiles/<id>/sync-meta.json
```

```ts
let metaStorePromise: Promise<Awaited<ReturnType<typeof Store.load>>> | null = null;
async function getMetaStore() {
  if (!metaStorePromise) {
    metaStorePromise = (async () => {
      const path = await invoke<string>("get_active_profile_sync_meta_path");
      return Store.load(path);
    })();
  }
  return metaStorePromise;
}
async function getMeta<T>(key: string, def: T): Promise<T> {
  const store = await getMetaStore();
  const v = await store.get<T>(key);
  return v ?? def;
}
async function setMeta(key: string, value: unknown): Promise<void> {
  const store = await getMetaStore();
  await store.set(key, value);
  await store.save();
}
```

Remove the now-unused `SYNC_META_STORE` references (the two old `Store.load(SYNC_META_STORE)` calls are replaced above). Ensure `invoke` is imported (it already is, line 12).

- [ ] **Step 2: Drive the sync-gate from `enabled`**

Add to imports (near the other `@/lib/sync` imports):

```ts
import { setSyncActive } from "@/lib/sync/sync-gate";
```

In the mount effect (lines 116-126), after `setEnabled(en);` add:

```ts
      setSyncActive(en);
```

In `enableSync` (wherever `setEnabled(true)` happens), add `setSyncActive(true);` immediately after. In `disableSync` (line ~451, after `setEnabled(false);`), add `setSyncActive(false);`.

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc -p tsconfig.json --noEmit`
Expected: clean (no unused `SYNC_META_STORE`, no type errors).

- [ ] **Step 4: Run the full Vitest suite (no regressions)**

Run: `pnpm exec vitest run`
Expected: all green (previous 266 + the new sync-gate/queue/store tests).

- [ ] **Step 5: Commit**

```bash
git add src/contexts/SyncContext.tsx
git commit -m "feat(sync): read sync-meta per profile and drive the sync-gate"
```

---

### Task 7: Full verification + manual recovery

**Files:** none (verification only).

- [ ] **Step 1: Rust suite + check**

Run: `export PATH="$PATH:/c/Program Files/CMake/bin"; LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo test -p lexena_lib && LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo check`
Expected: all tests pass, `cargo check` clean.

- [ ] **Step 2: Frontend type-check + tests**

Run: `pnpm exec tsc -p tsconfig.json --noEmit && pnpm exec vitest run`
Expected: clean + all green.

- [ ] **Step 3: Build a fresh prod exe (ask the user to run dev/build)**

The legacy contaminated root stores (`%APPDATA%/com.nolyo.lexena/sync-queue.json` + `sync-meta.json`) are deleted automatically on first launch of the fixed build (Task 2). After launch the user must **re-enable sync once** in the perso profile (the global `enabled` flag was discarded with the legacy meta).

- [ ] **Step 4: Manual E2E — confirm isolation**

  1. Launch fixed build in the **perso** profile, sign in, re-enable sync. Verify a fresh `profiles/<perso-id>/sync-queue.json` + `sync-meta.json` are created and no FK error appears (`Dernière erreur` empty).
  2. Switch to the **work** profile (app restarts). Edit the "Point Daily" note. Verify NO sync queue grows for work (sync gate inactive there) — inspect `profiles/<work-id>/` has no `sync-queue.json`, or it stays empty.
  3. Back in perso: confirm work's note never reaches the cloud (`select count(*) from user_notes where content_html ilike '%Point Daily%'` in Supabase Studio = 0, assuming Point Daily lives only in work).

- [ ] **Step 5: Update CLAUDE.md note**

Add to the "V3 Sync notes" section a line documenting per-profile sync isolation (queue+meta under `profiles/<id>/`, sync-gate, legacy root cleanup) and commit:

```bash
git add CLAUDE.md docs/superpowers/plans/2026-06-23-sync-profile-isolation.md
git commit -m "docs(sync): document per-profile sync isolation fix"
```

---

## Self-Review

- **Spec coverage:** Root cause = (a) global queue, (b) global enabled, (c) ungated enqueue. Task 4 fixes (a); Task 6 fixes (b); Tasks 3+5 fix (c); Task 2 cleans the existing poison; Task 1 provides the Rust paths. Covered.
- **Type consistency:** `get_active_profile_sync_queue_path` / `get_active_profile_sync_meta_path` defined in Task 1 and consumed verbatim in Tasks 4 & 6. `setSyncActive`/`isSyncActive`/`__resetForTests` defined in Task 3, consumed in Tasks 5 & 6.
- **Placeholder scan:** All code steps contain concrete code; the only "copy field names from an existing test" note is a guardrail against guessing `LocalNoteMeta` shape, not a placeholder for logic.
- **Out of scope (deliberate):** snippets/dictionary stores stay global (Global Constraints); multi-profile cloud (`profile_id` column) remains deferred per ADR 0010; no change to Edge Functions.
