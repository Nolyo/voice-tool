# PR 4 — Folder Emoji Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each folder can carry a free-form emoji icon (curated grid + free input in the name dialog), displayed wherever the lucide `<Folder>` glyph represents a named folder, and synced across devices through the existing LWW folder row.

**Architecture:** The emoji is a new nullable field on the folder: `icon: Option<String>` in Rust (`folders.rs`), `icon TEXT` column on `user_folders` (additive migration), `icon` transported by `mapping.ts`/`merge.ts`/`schemas.ts` and stamped by the `sync-push` Edge Function on `folder-upsert`. No new merge logic — the icon travels in the same LWW row as the name (`updated_at`). The dialog (`FolderNameDialog`) becomes the single mutation point for the (name, icon) pair; `create_folder`/`rename_folder` are extended to write both atomically.

**Tech Stack:** Rust (serde), Supabase (Postgres + Deno Edge Functions), TypeScript/React 19, Zod, Vitest (+ jsdom/RTL), Deno test.

## Global Constraints

- Branch `feat/folder-emoji`, **never commit to main** (protected — PR only).
- **CRITICAL — Zod strip:** `CloudUserFolderRowSchema` (client, `src/lib/sync/schemas.ts`) MUST gain the `icon` field. `z.object()` strips unknown keys on `safeParse`, so without it the pulled emoji is silently dropped and never reaches the local store.
- Icon validation: Edge accepts `z.string().min(1).max(32).nullable().optional()`. Clients never send `""` — Rust `normalize_icon` maps empty/whitespace to `None`, and the dialog's free input goes through `firstGrapheme` (single grapheme cluster).
- Retro-compat: old clients omit `icon` in `folder-upsert` → server stamps `null` (row-level LWW; an old client renaming a folder clears its icon — accepted by the spec). `icon` is `.optional()` in the client row schema so a pre-migration DB row still parses.
- All UI strings via react-i18next (title AND aria-label included), added to BOTH `src/locales/fr.json` and `src/locales/en.json`.
- CHANGELOG entry in English.
- Migration file uses a REAL timestamp `YYYYMMDDHHMMSS` generated at file-creation time (PowerShell: `Get-Date -Format yyyyMMddHHmmss`).
- Supabase is prod-only (no test DB). The migration file is created in Task 2 but `db push` + Edge deploy happen ONLY in Task 8 (controller-executed), in this order: db push → deploy sync-push. `account-export` needs NO change and NO redeploy (it does `select("*")`, which picks up the new column dynamically) — the spec's "redeploy both" predates this code-level fact.
- Test baselines before this PR: **Vitest 451 tests / 63 files**; **Rust `folders::tests` = 9 tests**; Deno sync-push suite green (`deno test` from `supabase/functions/sync-push/`, deno 2.7.13).
- Rust test env (Bash tool, from `src-tauri/`):
  ```bash
  export PATH="$PATH:/c/Program Files/CMake/bin"
  LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo test --lib folders::tests
  ```
  If compilation fails with a cmake/MAX_PATH Vulkan error, retry with `--no-default-features`.
- Never run `pnpm tauri dev`.
- pgtap artifacts: NO update needed — verified that no folder test enumerates `user_folders` columns (`rls_user_folders.sql` has no column assertions; `profile_id_columns.sql` only checks `profile_id`).

---

### Task 1: Rust — `icon` field on `FolderMeta` + extended commands

**Files:**
- Modify: `src-tauri/src/folders.rs`

**Interfaces:**
- Produces: `FolderMeta.icon: Option<String>` serialized as camelCase `icon`, omitted when `None`. `create_folder(app_handle, name: String, icon: Option<String>)` and `rename_folder(app_handle, id: String, name: String, icon: Option<String>)`. TS invokes will pass `icon: string | null` (Task 4).
- `rename_folder`'s `icon` is the FULL desired state: `None` clears any existing emoji. The dialog is the single mutation point and always sends the complete (name, icon) pair.

- [ ] **Step 1: Write the failing tests**

Add to the `tests` module in `src-tauri/src/folders.rs` (after `purge_post_pull_retain_only_drops_tombstoned_in_target_set`):

```rust
    #[test]
    fn folder_meta_roundtrips_icon() {
        let mut folder = make_folder("2026-05-19T11:00:00Z", None);
        folder.icon = Some("📁".to_string());
        let json = serde_json::to_string(&folder).expect("serialize");
        assert!(
            json.contains("\"icon\":\"📁\""),
            "expected icon in JSON, got: {}",
            json
        );
        let decoded: FolderMeta = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(decoded.icon, Some("📁".to_string()));
    }

    #[test]
    fn folder_meta_deserializes_without_icon() {
        // Backward compat: folders.json written before the icon field existed.
        let legacy_json = r#"{
            "id": "x",
            "name": "n",
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z",
            "order": 0
        }"#;
        let meta: FolderMeta = serde_json::from_str(legacy_json).expect("deserialize legacy");
        assert_eq!(meta.icon, None);
    }

    #[test]
    fn folder_meta_skips_icon_when_none() {
        let folder = make_folder("2026-05-19T11:00:00Z", None);
        let json = serde_json::to_string(&folder).expect("serialize");
        assert!(
            !json.contains("\"icon\""),
            "expected icon to be omitted when None, got: {}",
            json
        );
    }

    #[test]
    fn normalize_icon_trims_and_maps_empty_to_none() {
        assert_eq!(normalize_icon(None), None);
        assert_eq!(normalize_icon(Some("".to_string())), None);
        assert_eq!(normalize_icon(Some("   ".to_string())), None);
        assert_eq!(normalize_icon(Some(" 📁 ".to_string())), Some("📁".to_string()));
    }
```

These reference `FolderMeta.icon`, `make_folder` (which must set `icon: None`), and `normalize_icon` — none exist yet.

- [ ] **Step 2: Run tests to verify they fail**

Run (Bash tool, from `src-tauri/`):
```bash
export PATH="$PATH:/c/Program Files/CMake/bin"
LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo test --lib folders::tests
```
Expected: COMPILE ERROR (`no field icon on FolderMeta`, `cannot find function normalize_icon`).

- [ ] **Step 3: Implement**

3a. Add the field to `FolderMeta`, right after `pub name: String,`:

```rust
    /// Emoji icon shown instead of the default folder glyph. `None` = default
    /// glyph. Synced through the cloud row (same LWW timestamp as the name).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
```

3b. Add the pure helper right after `is_folder_active`:

```rust
/// Pure helper: trims the icon and maps empty/whitespace-only strings to
/// `None`, so an empty icon is never persisted (the sync-push Edge Function
/// rejects "" with min(1) too).
fn normalize_icon(icon: Option<String>) -> Option<String> {
    icon.and_then(|s| {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}
```

3c. Extend `create_folder` — new signature and literal:

```rust
#[tauri::command]
pub async fn create_folder(
    app_handle: AppHandle,
    name: String,
    icon: Option<String>,
) -> Result<FolderMeta, String> {
```
and in the `FolderMeta` literal add `icon: normalize_icon(icon),` after `name: trimmed.to_string(),`.

3d. Extend `rename_folder` — replace the doc-less command with:

```rust
/// Rename a folder and set its emoji icon in one atomic write.
/// `icon` is the FULL desired state: `None` clears any existing emoji (the
/// FolderNameDialog is the single mutation point and always sends the
/// complete name+icon pair). `updated_at` is bumped so LWW ships both.
#[tauri::command]
pub async fn rename_folder(
    app_handle: AppHandle,
    id: String,
    name: String,
    icon: Option<String>,
) -> Result<FolderMeta, String> {
```
and next to `folder.name = trimmed.to_string();` add `folder.icon = normalize_icon(icon);`.

3e. Fix ALL remaining `FolderMeta` struct literals (missing-field compile errors otherwise). Add `icon: None,` after the `name` field in each:
- `make_folder` test helper (~line 250)
- the 2 literals in `import_folders_payload_roundtrips_preserves_all_fields` — set the FIRST one (`active-1`) to `icon: Some("💼".to_string()),` instead of `None`, and extend its assertions with `assert_eq!(restored[0].icon, Some("💼".to_string()));` (proves backup import round-trips the icon); the second (`tombstoned-1`) gets `icon: None,` and `assert_eq!(restored[1].icon, None);`
- the 3 literals in `purge_post_pull_retain_only_drops_tombstoned_in_target_set` (`icon: None,`)

- [ ] **Step 4: Run tests to verify they pass**

Same command as Step 2.
Expected: `test result: ok. 13 passed` (9 existing + 4 new) in `folders::tests`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/folders.rs
git commit -m "feat: folder icon field + atomic create/rename with emoji (Rust)"
```

---

### Task 2: Supabase migration file (additive `icon` column)

**Files:**
- Create: `supabase/migrations/<TIMESTAMP>_user_folders_icon.sql` where `<TIMESTAMP>` = output of `Get-Date -Format yyyyMMddHHmmss` (PowerShell) at creation time.

**Interfaces:**
- Produces: `user_folders.icon TEXT NULL` — consumed by sync-push (Task 5) and pulled by `client.ts` `select("*")` (no client query change needed).

- [ ] **Step 1: Generate the real timestamp**

Run: `Get-Date -Format yyyyMMddHHmmss`
Use the printed value as the filename prefix.

- [ ] **Step 2: Create the migration file**

```sql
-- PR4 UX series: emoji icon per folder.
-- Additive + nullable: legacy clients ignore the column; an absent icon
-- renders the default Folder glyph client-side. RLS unchanged (icon is a
-- plain attribute inside the user-scoped row).
alter table public.user_folders add column if not exists icon text;
```

- [ ] **Step 3: Verify no pgtap artifact needs updating**

Run: `grep -rn "user_folders" supabase/tests/ | grep -v profile_id`
Expected: only `rls_user_folders.sql` matches and it contains no column enumeration (inserts use explicit column lists unaffected by a new nullable column). No pgtap change.

**DO NOT run `db push` in this task** — deployment happens in Task 8, controller-executed, in the same window as the sync-push deploy.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add nullable icon column to user_folders"
```

---

### Task 3: Client sync layer — types, schemas, mapping, merge

**Files:**
- Modify: `src/lib/sync/types.ts`, `src/lib/sync/schemas.ts`, `src/lib/sync/mapping.ts`, `src/lib/sync/merge.ts`
- Test: `src/lib/sync/mapping.test.ts`, `src/lib/sync/schemas.test.ts`, `src/lib/sync/merge.test.ts`

**Interfaces:**
- Consumes: nothing new (pure TS layer).
- Produces: `LocalFolderMeta.icon?: string`; `FolderPayload.icon: string | null`; `CloudUserFolderRow.icon?: string | null`; `mapFolderToCloud` emits `icon` (null when absent); `mapFolderFromCloud` / `mergeFolderLWW` omit the `icon` key when the row has null. Consumed by Tasks 4, 5, 7.

- [ ] **Step 1: Write the failing tests**

1a. `src/lib/sync/mapping.test.ts` — in the existing folder describe block, ADD these 4 tests (reuse the existing `UUID_F`/`UUID_U` constants):

```ts
  it("mapFolderToCloud carries the icon when set", () => {
    const folder: LocalFolderMeta = {
      id: UUID_F,
      name: "Recipes",
      icon: "🍽️",
      createdAt: "2026-05-19T10:00:00Z",
      updatedAt: "2026-05-19T11:00:00Z",
      order: 2,
    };
    expect(mapFolderToCloud(folder).icon).toBe("🍽️");
  });

  it("mapFolderFromCloud sets icon for a row carrying an emoji", () => {
    const row: CloudUserFolderRow = {
      id: UUID_F,
      user_id: UUID_U,
      profile_id: UUID_U,
      name: "Recipes",
      icon: "🔥",
      order: 2,
      created_at: "2026-05-19T10:00:00Z",
      updated_at: "2026-05-19T11:00:00Z",
      deleted_at: null,
    };
    expect(mapFolderFromCloud(row).icon).toBe("🔥");
  });

  it("mapFolderFromCloud omits the icon key when the row has null", () => {
    const row: CloudUserFolderRow = {
      id: UUID_F,
      user_id: UUID_U,
      profile_id: UUID_U,
      name: "Recipes",
      icon: null,
      order: 2,
      created_at: "2026-05-19T10:00:00Z",
      updated_at: "2026-05-19T11:00:00Z",
      deleted_at: null,
    };
    expect(Object.keys(mapFolderFromCloud(row)).includes("icon")).toBe(false);
  });

  it("mapFolderToCloud output with icon validates against sync-push FolderPayloadSchema", () => {
    const folder: LocalFolderMeta = {
      id: UUID_F,
      name: "Recipes",
      icon: "📌",
      createdAt: "2026-05-19T10:00:00Z",
      updatedAt: "2026-05-19T11:00:00Z",
      order: 2,
    };
    const parsed = SyncPushFolderPayloadSchema.safeParse(mapFolderToCloud(folder));
    expect(parsed.success).toBe(true);
  });
```

1b. `src/lib/sync/mapping.test.ts` — UPDATE existing fixtures (they will fail after the implementation change, list them precisely):
- Test `"mapFolderToCloud emits id/name/order/updated_at/deleted_at"`: the `toEqual({...})` payload gains `icon: null,`.
- Test `"folder: cloud -> local -> cloud is symmetric for an active row"`: the `back` `toEqual({...})` gains `icon: null,`.
- Mirror schema `SyncPushFolderPayloadSchema` (top of file, ~line 34): add `icon: z.string().min(1).max(32).nullable().optional(),` after `name`.

1c. `src/lib/sync/schemas.test.ts` — add import `CloudUserFolderRowSchema` from `./schemas` and this describe:

```ts
const FOLDER_ID = "33333333-3333-4333-8333-333333333333";
const PROFILE_ID = "44444444-4444-4444-8444-444444444444";

describe("CloudUserFolderRowSchema icon", () => {
  const base = {
    id: FOLDER_ID,
    user_id: USER_ID,
    profile_id: PROFILE_ID,
    name: "Inbox",
    order: 0,
    created_at: "2026-07-13T00:00:00Z",
    updated_at: "2026-07-13T00:00:00Z",
    deleted_at: null,
  };

  it("preserves a string icon through parsing (no Zod strip)", () => {
    const r = CloudUserFolderRowSchema.safeParse({ ...base, icon: "📁" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.icon).toBe("📁");
  });

  it("accepts icon null and an absent icon key", () => {
    expect(CloudUserFolderRowSchema.safeParse({ ...base, icon: null }).success).toBe(true);
    expect(CloudUserFolderRowSchema.safeParse(base).success).toBe(true);
  });
});
```

1d. `src/lib/sync/merge.test.ts` — in the `mergeFolderLWW` describe, add:

```ts
  it("adopting remote copies the icon", () => {
    const remote = cloudFolder({ icon: "📁", updated_at: "2026-01-02T00:00:00Z" });
    const merged = mergeFolderLWW(null, remote);
    expect(merged.icon).toBe("📁");
  });

  it("remote with icon null → icon key absent on the merged local", () => {
    const remote = cloudFolder({ icon: null });
    const merged = mergeFolderLWW(null, remote);
    expect(Object.keys(merged).includes("icon")).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run src/lib/sync/mapping.test.ts src/lib/sync/schemas.test.ts src/lib/sync/merge.test.ts`
Expected: FAIL — TS errors on the `icon` properties (types don't have it yet) and/or assertion failures.

- [ ] **Step 3: Implement**

3a. `src/lib/sync/types.ts`:
- `LocalFolderMeta`: add after `name: string;` → `/** Emoji icon; key absent = default folder glyph. */\n  icon?: string;`
- `FolderPayload`: add after `name: string;` → `/** Emoji icon; null clears it. Travels in the same LWW row as the name. */\n  icon: string | null;`
- `CloudUserFolderRow`: add after `name: string;` → `/** Optional to tolerate a pre-migration DB row. */\n  icon?: string | null;`

3b. `src/lib/sync/schemas.ts` — `CloudUserFolderRowSchema`: add `icon: z.string().nullable().optional(),` after `name: z.string(),`.

3c. `src/lib/sync/mapping.ts`:
- `mapFolderToCloud`: add `icon: folder.icon ?? null,` after `name: folder.name,`.
- `mapFolderFromCloud`: add `...(typeof row.icon === "string" && { icon: row.icon }),` after `name: row.name,`.

3d. `src/lib/sync/merge.ts` — `mergeFolderLWW`, in `remoteAsLocal`: add `...(typeof remote.icon === "string" && { icon: remote.icon }),` after `name: remote.name,`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- --run src/lib/sync/mapping.test.ts src/lib/sync/schemas.test.ts src/lib/sync/merge.test.ts`
Expected: PASS (mapping: 4 new + 2 updated fixtures green; schemas: +2; merge: +2).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/types.ts src/lib/sync/schemas.ts src/lib/sync/mapping.ts src/lib/sync/merge.ts src/lib/sync/mapping.test.ts src/lib/sync/schemas.test.ts src/lib/sync/merge.test.ts
git commit -m "feat: transport folder icon through client sync layer"
```

---

### Task 4: Stores — `folders-store`, `useFolders`, `backups` typing

**Files:**
- Modify: `src/lib/sync/folders-store.ts`, `src/hooks/useFolders.ts`, `src/lib/sync/backups.ts`
- Test: `src/lib/sync/folders-store.test.ts`

**Interfaces:**
- Consumes: Task 1 commands (`create_folder`/`rename_folder` with `icon`), Task 3 types.
- Produces: `createFolderSynced(name, icon?: string | null)`, `renameFolderSynced(id, name, icon?: string | null)`; `useFolders().createFolder(name, icon?)` / `.renameFolder(id, name, icon?)`; `useFolders.FolderMeta.icon?: string`. Consumed by Task 7 (UI threading).

- [ ] **Step 1: Write the failing tests**

In `src/lib/sync/folders-store.test.ts`:

1a. UPDATE the two arg-assert fixtures (they break once the implementation always sends `icon`):
- In `"invokes create_folder then enqueues folder-upsert"`: `expect(args).toEqual({ name: "Work" })` → `expect(args).toEqual({ name: "Work", icon: null })`.
- In `"invokes rename_folder then enqueues folder-upsert"`: `expect(args).toEqual({ id: "fld-2", name: "Renamed" })` → `expect(args).toEqual({ id: "fld-2", name: "Renamed", icon: null })`.

1b. ADD in the `createFolderSynced` describe:

```ts
  it("passes the icon to create_folder and ships it in the enqueued op", async () => {
    const folder = makeFolder({ id: "fld-icon", name: "Fire", icon: "🔥" });
    invokeHandlers["create_folder"] = (args) => {
      expect(args).toEqual({ name: "Fire", icon: "🔥" });
      return folder;
    };
    await createFolderSynced("Fire", "🔥");
    const op = enqueueMock.mock.calls[0][0];
    if (op.kind !== "folder-upsert") throw new Error("expected folder-upsert");
    expect(op.folder.icon).toBe("🔥");
  });
```

1c. ADD in the `renameFolderSynced` describe:

```ts
  it("passes the icon to rename_folder and ships it in the enqueued op", async () => {
    const folder = makeFolder({ id: "fld-5", name: "Goals", icon: "🎯" });
    invokeHandlers["rename_folder"] = (args) => {
      expect(args).toEqual({ id: "fld-5", name: "Goals", icon: "🎯" });
      return folder;
    };
    await renameFolderSynced("fld-5", "Goals", "🎯");
    const op = enqueueMock.mock.calls[0][0];
    if (op.kind !== "folder-upsert") throw new Error("expected folder-upsert");
    expect(op.folder.icon).toBe("🎯");
  });
```

(`makeFolder({ icon: "🔥" })` compiles as-is: `LocalFolderMeta.icon` is optional and the factory spreads partials.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run src/lib/sync/folders-store.test.ts`
Expected: FAIL — `createFolderSynced` doesn't accept a second argument / args mismatch.

- [ ] **Step 3: Implement**

3a. `src/lib/sync/folders-store.ts`:

```ts
export async function createFolderSynced(
  name: string,
  icon?: string | null
): Promise<LocalFolderMeta> {
  const folder = await invoke<LocalFolderMeta>("create_folder", { name, icon: icon ?? null });
```

```ts
export async function renameFolderSynced(
  id: string,
  name: string,
  icon?: string | null
): Promise<LocalFolderMeta> {
  const folder = await invoke<LocalFolderMeta>("rename_folder", { id, name, icon: icon ?? null });
```

(Bodies otherwise unchanged.)

3b. `src/hooks/useFolders.ts`:
- `FolderMeta` interface: add after `name: string;` → `/** Emoji icon; absent = default folder glyph. */\n  icon?: string;`
- `createFolder`: `const createFolder = async (name: string, icon?: string | null): Promise<FolderMeta> => { const meta = await createFolderSynced(name, icon); ... }` (rest unchanged).
- `renameFolder`: `const renameFolder = async (id: string, name: string, icon?: string | null): Promise<FolderMeta> => { const updated = await renameFolderSynced(id, name, icon); ... }` (rest unchanged).

3c. `src/lib/sync/backups.ts` — `BackupFolderMeta`: add after `name: string;` → `icon?: string;` (backup snapshot/restore flows through Rust serde, so the field round-trips automatically; only the type needs the key).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- --run src/lib/sync/folders-store.test.ts`
Expected: PASS — 17 tests in the file (15 existing incl. 2 updated + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/folders-store.ts src/lib/sync/folders-store.test.ts src/hooks/useFolders.ts src/lib/sync/backups.ts
git commit -m "feat: thread folder icon through stores and useFolders"
```

---

### Task 5: Edge Function `sync-push` — accept and stamp `icon`

**Files:**
- Modify: `supabase/functions/sync-push/schema.ts`, `supabase/functions/sync-push/index.ts`
- Test: `supabase/functions/sync-push/test.ts`

**Interfaces:**
- Consumes: `FolderPayload.icon` sent by the client (Task 3/4).
- Produces: `user_folders.icon` stamped on every `folder-upsert` (`null` when the payload omits it). Deployed in Task 8 AFTER the db push.

- [ ] **Step 1: Write the failing tests**

In `supabase/functions/sync-push/test.ts`:

1a. EXTEND `"folder-upsert: forwards id, name, order on user_folders"`: after `assertEquals(upserts[0].record.deleted_at, null);` add:
```ts
  // Retro-compat pin: a pre-icon client omits the field → server stamps null.
  assertEquals(upserts[0].record.icon, null);
```

1b. ADD after that test:

```ts
Deno.test("folder-upsert: forwards icon when provided", async () => {
  const { handler } = await import("./index.ts");
  const auth = authOk("user-folder-icon");
  const folder = makeFolder({ name: "Fire", icon: "🔥" });
  const req = postJson({
    operations: [{ kind: "folder-upsert", folder }],
    device_id: "d",
  });
  const res = await handler(req, auth);
  assertEquals(res.status, 200);
  const upserts = auth.calls.filter((c): c is UpsertCall => c.kind === "upsert");
  assertEquals(upserts.length, 1);
  assertEquals(upserts[0].record.icon, "🔥");
});

Deno.test("folder-upsert: rejects empty-string icon (400 invalid body)", async () => {
  const { handler } = await import("./index.ts");
  const auth = authOk();
  const folder = makeFolder({ icon: "" });
  const req = postJson({
    operations: [{ kind: "folder-upsert", folder }],
    device_id: "d",
  });
  const res = await handler(req, auth);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "invalid body");
  assertEquals(auth.calls.length, 0);
});
```

(`makeFolder` spreads overrides — no factory change needed.)

- [ ] **Step 2: Run tests to verify they fail**

Run (from `supabase/functions/sync-push/`): `deno test`
Expected: the 2 new tests FAIL (icon stripped by Zod → `record.icon` is `undefined`, not `"🔥"`/`null`; empty icon returns 200 instead of 400).

- [ ] **Step 3: Implement**

3a. `supabase/functions/sync-push/schema.ts` — `FolderPayloadSchema`: add after the `name` line:

```ts
  // Emoji icon (PR4). Optional for backward-compat with pre-icon clients; the
  // handler stamps null when absent (row-level LWW — an old client renaming a
  // folder clears its icon, accepted trade-off). max(32) covers the longest
  // ZWJ emoji sequences; min(1) rejects "" (clients normalize "" → null).
  icon: z.string().min(1).max(32).nullable().optional(),
```

3b. `supabase/functions/sync-push/index.ts` — `case "folder-upsert"` record: add `icon: op.folder.icon ?? null,` after `name: op.folder.name,`.

- [ ] **Step 4: Run tests to verify they pass**

Run (from `supabase/functions/sync-push/`): `deno test`
Expected: full suite PASS (all existing + 2 new; the extended forwards test green).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/sync-push/schema.ts supabase/functions/sync-push/index.ts supabase/functions/sync-push/test.ts
git commit -m "feat: sync-push accepts and stamps folder icon"
```

---

### Task 6: `firstGrapheme` helper + emoji picker in `FolderNameDialog` + i18n

**Files:**
- Create: `src/lib/emoji.ts`, `src/lib/emoji.test.ts`, `src/components/notes/FolderNameDialog.test.tsx`
- Modify: `src/components/notes/FolderNameDialog.tsx`, `src/locales/fr.json`, `src/locales/en.json`

**Interfaces:**
- Consumes: nothing (pure UI + helper).
- Produces: `firstGrapheme(input: string): string | null` (exported from `src/lib/emoji.ts`); `FolderNameDialog` props gain `initialIcon?: string | null` and `onSubmit` becomes `(name: string, icon: string | null) => void`. Consumed by Task 7 (callers).

- [ ] **Step 1: Write the failing helper tests**

Create `src/lib/emoji.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { firstGrapheme } from "./emoji";

describe("firstGrapheme", () => {
  it("returns a plain character as-is", () => {
    expect(firstGrapheme("a")).toBe("a");
  });

  it("keeps only the first grapheme of a longer string", () => {
    expect(firstGrapheme("📁 docs")).toBe("📁");
  });

  it("keeps a ZWJ emoji sequence whole", () => {
    expect(firstGrapheme("👨‍👩‍👧‍👦xyz")).toBe("👨‍👩‍👧‍👦");
  });

  it("keeps a flag emoji (regional indicator pair) whole", () => {
    expect(firstGrapheme("🇫🇷 France")).toBe("🇫🇷");
  });

  it("returns null for an empty string", () => {
    expect(firstGrapheme("")).toBeNull();
  });

  it("returns null for whitespace-only input", () => {
    expect(firstGrapheme("   ")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test -- --run src/lib/emoji.test.ts`
Expected: FAIL — module `./emoji` not found.

- [ ] **Step 3: Implement the helper**

Create `src/lib/emoji.ts`:

```ts
/** Extract the first grapheme cluster (user-perceived character) of a string.
 * Used to clamp the folder-icon free input to a single emoji: grapheme
 * segmentation keeps ZWJ sequences (👨‍👩‍👧‍👦) and flag pairs (🇫🇷) whole where a
 * naive code-point slice would split them. Returns null for empty or
 * whitespace-only input. Falls back to the first code point when
 * Intl.Segmenter is unavailable (very old WebViews). */
export function firstGrapheme(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const first = segmenter.segment(trimmed)[Symbol.iterator]().next();
    return first.done ? null : first.value.segment;
  }
  return Array.from(trimmed)[0] ?? null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test -- --run src/lib/emoji.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the failing dialog tests**

Create `src/components/notes/FolderNameDialog.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? k,
  }),
}));

import { FolderNameDialog } from "./FolderNameDialog";

afterEach(() => cleanup());

function renderDialog(
  props: Partial<ComponentProps<typeof FolderNameDialog>> = {}
) {
  const onSubmit = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <FolderNameDialog
      open
      mode="create"
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      {...props}
    />
  );
  return { onSubmit, onOpenChange };
}

const nameInput = () => screen.getByLabelText("notes.folders.namePrompt");
const customInput = () =>
  screen.getByLabelText("notes.folders.iconCustomPlaceholder");
const saveButton = () => screen.getByRole("button", { name: "common.save" });

describe("FolderNameDialog icon picker", () => {
  it("create: submits the name with a null icon by default", () => {
    const { onSubmit } = renderDialog();
    fireEvent.change(nameInput(), { target: { value: "Work" } });
    fireEvent.click(saveButton());
    expect(onSubmit).toHaveBeenCalledWith("Work", null);
  });

  it("create: picking a grid emoji submits it", () => {
    const { onSubmit } = renderDialog();
    fireEvent.change(nameInput(), { target: { value: "Work" } });
    fireEvent.click(screen.getByText("🔥"));
    fireEvent.click(saveButton());
    expect(onSubmit).toHaveBeenCalledWith("Work", "🔥");
  });

  it("free input keeps only the first grapheme", () => {
    const { onSubmit } = renderDialog();
    fireEvent.change(nameInput(), { target: { value: "Work" } });
    fireEvent.change(customInput(), { target: { value: "📌 x" } });
    fireEvent.click(saveButton());
    expect(onSubmit).toHaveBeenCalledWith("Work", "📌");
  });

  it("rename: save is disabled when name and icon are unchanged", () => {
    renderDialog({ mode: "rename", initialValue: "Docs", initialIcon: "📁" });
    expect(saveButton()).toBeDisabled();
  });

  it("rename: changing only the icon enables save and submits it", () => {
    const { onSubmit } = renderDialog({
      mode: "rename",
      initialValue: "Docs",
      initialIcon: null,
    });
    fireEvent.click(screen.getByText("🎯"));
    expect(saveButton()).toBeEnabled();
    fireEvent.click(saveButton());
    expect(onSubmit).toHaveBeenCalledWith("Docs", "🎯");
  });

  it("the none button clears a picked emoji", () => {
    const { onSubmit } = renderDialog({
      mode: "rename",
      initialValue: "Docs",
      initialIcon: "🔥",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "notes.folders.iconNone" })
    );
    fireEvent.click(saveButton());
    expect(onSubmit).toHaveBeenCalledWith("Docs", null);
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `pnpm test -- --run src/components/notes/FolderNameDialog.test.tsx`
Expected: FAIL — no icon picker in the dialog, `onSubmit` called with one argument.

- [ ] **Step 7: Implement the dialog**

Replace `src/components/notes/FolderNameDialog.tsx` entirely with:

```tsx
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { firstGrapheme } from "@/lib/emoji";

/** Curated grid of common folder emojis; the free input below covers the rest. */
const EMOJI_GRID: readonly string[] = [
  "📁", "💼", "🏠", "📚", "📝", "💡", "🎯", "⭐",
  "❤️", "🔥", "✅", "📌", "🗓️", "💰", "🛒", "🎮",
  "🎵", "🎬", "✈️", "🍽️", "💪", "🌱", "🔧", "🧠",
];

interface FolderNameDialogProps {
  open: boolean;
  mode: "create" | "rename";
  initialValue?: string;
  /** Current emoji when renaming; null/undefined = default folder glyph. */
  initialIcon?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string, icon: string | null) => void;
}

export function FolderNameDialog({
  open,
  mode,
  initialValue = "",
  initialIcon = null,
  onOpenChange,
  onSubmit,
}: FolderNameDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  const [icon, setIcon] = useState<string | null>(initialIcon ?? null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setIcon(initialIcon ?? null);
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
      return () => window.clearTimeout(id);
    }
  }, [open, initialValue, initialIcon]);

  const trimmed = value.trim();
  const unchanged =
    mode === "rename" &&
    trimmed === initialValue.trim() &&
    icon === (initialIcon ?? null);
  const canSubmit = trimmed.length > 0 && !unchanged;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed, icon);
    onOpenChange(false);
  };

  const title =
    mode === "create"
      ? t("notes.folders.newFolder")
      : t("notes.folders.rename");

  // The free input mirrors the icon only when it doesn't come from the grid,
  // so picking a grid emoji visibly clears the custom field.
  const customValue = icon !== null && !EMOJI_GRID.includes(icon) ? icon : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("notes.folders.namePrompt")}
            aria-label={t("notes.folders.namePrompt")}
            autoComplete="off"
          />
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {t("notes.folders.iconLabel")}
            </p>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setIcon(null)}
                title={t("notes.folders.iconNone")}
                aria-label={t("notes.folders.iconNone")}
                aria-pressed={icon === null}
                className={`h-7 w-7 rounded inline-flex items-center justify-center transition-colors ${
                  icon === null ? "bg-accent ring-2 ring-primary" : "hover:bg-accent"
                }`}
              >
                <Folder className="w-4 h-4" />
              </button>
              {EMOJI_GRID.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  aria-label={t("notes.folders.iconPick", { emoji })}
                  aria-pressed={icon === emoji}
                  className={`h-7 w-7 rounded text-base leading-none inline-flex items-center justify-center transition-colors ${
                    icon === emoji ? "bg-accent ring-2 ring-primary" : "hover:bg-accent"
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <Input
              value={customValue}
              onChange={(e) => setIcon(firstGrapheme(e.target.value))}
              placeholder={t("notes.folders.iconCustomPlaceholder")}
              aria-label={t("notes.folders.iconCustomPlaceholder")}
              autoComplete="off"
              className="mt-2"
            />
          </div>
          <DialogFooter className="gap-2 mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 8: Add i18n keys**

In `src/locales/fr.json`, inside `notes.folders` (after `"namePrompt"`):

```json
      "iconLabel": "Icône",
      "iconNone": "Aucune icône",
      "iconCustomPlaceholder": "Ou tapez un emoji…",
      "iconPick": "Utiliser {{emoji}}"
```

In `src/locales/en.json`, inside `notes.folders` (same position):

```json
      "iconLabel": "Icon",
      "iconNone": "No icon",
      "iconCustomPlaceholder": "Or type an emoji…",
      "iconPick": "Use {{emoji}}"
```

(Mind the trailing comma on the previous line in both files.)

- [ ] **Step 9: Run to verify pass**

Run: `pnpm test -- --run src/components/notes/FolderNameDialog.test.tsx src/lib/emoji.test.ts`
Expected: PASS (6 + 6). Note: the two existing callers still pass a one-arg `onSubmit` — extra args are ignored at runtime and the prop type accepts narrower callbacks, so nothing breaks before Task 7 rewires them. Run `pnpm build` to confirm the compile is clean at this point.

- [ ] **Step 10: Commit**

```bash
git add src/lib/emoji.ts src/lib/emoji.test.ts src/components/notes/FolderNameDialog.tsx src/components/notes/FolderNameDialog.test.tsx src/locales/fr.json src/locales/en.json
git commit -m "feat: emoji picker in folder dialog + firstGrapheme helper"
```

---

### Task 7: Display everywhere + prop threading + CHANGELOG

**Files:**
- Create: `src/components/notes/FolderIcon.tsx`
- Modify: `src/components/notes/NotesSidebarSection.tsx`, `src/components/dashboard/DashboardSidebar.tsx`, `src/components/Dashboard.tsx`, `src/components/notes/NotesEditor/NotesEditor.tsx`, `src/components/notes/NotesEditor/NotesEditorTitleBar.tsx`, `src/components/notes/NotesEditor/NotesEditorHeader.tsx`, `CHANGELOG.md`

**Interfaces:**
- Consumes: `FolderMeta.icon?: string` (Task 4), `FolderNameDialog` new props (Task 6).
- Produces: `<FolderIcon icon={...} className={...} style={...} />`; `onCreateFolder: (name: string, icon?: string | null) => Promise<FolderMeta>` and `onRenameFolder: (id: string, name: string, icon?: string | null) => Promise<void>` threaded Dashboard → DashboardSidebar → NotesSidebarSection and Dashboard → NotesEditor → NotesEditorTitleBar.
- Component tree (verified): Dashboard → DashboardSidebar → NotesSidebarSection; Dashboard → NotesEditor → NotesEditorTitleBar. The 5 display sites are: FolderSection header, sidebar context menu, title-bar badge menu, title-bar badge itself, editor breadcrumb. `moveToRoot` entries and the "unfiled" breadcrumb keep the plain `<Folder>` glyph.

- [ ] **Step 1: Create `FolderIcon`**

Create `src/components/notes/FolderIcon.tsx`:

```tsx
import type { CSSProperties } from "react";
import { Folder } from "lucide-react";

interface FolderIconProps {
  icon?: string;
  className?: string;
  style?: CSSProperties;
}

/** Renders a folder's emoji icon when set, the default lucide `Folder` glyph
 * otherwise. The emoji is decorative (the folder name is always adjacent),
 * hence aria-hidden. Callers pass the same sizing classes they used on
 * `<Folder>` (`w-3 h-3` & co); the fixed 11px font keeps the emoji inside
 * that box. */
export function FolderIcon({ icon, className, style }: FolderIconProps) {
  if (icon) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center leading-none select-none text-[11px] ${className ?? ""}`}
        style={style}
      >
        {icon}
      </span>
    );
  }
  return <Folder className={className} style={style} />;
}
```

- [ ] **Step 2: NotesSidebarSection.tsx**

2a. Add import: `import { FolderIcon } from "@/components/notes/FolderIcon";` (keep the existing `Folder` lucide import — still used by `moveToRoot`).

2b. `FolderSectionProps`: `onRename: (id: string, currentName: string, currentIcon?: string) => void;`

2c. FolderSection header (~line 316): replace
```tsx
          <Folder className="w-3 h-3 shrink-0" style={{ color: "var(--vt-accent-2)" }} />
```
with
```tsx
          <FolderIcon icon={folder.icon} className="w-3 h-3 shrink-0" style={{ color: "var(--vt-accent-2)" }} />
```

2d. Rename button (~line 357): `onRename(folder.id, folder.name, folder.icon);`

2e. `NotesSidebarSectionProps` (lines 84-85):
```ts
  onCreateFolder: (name: string, icon?: string | null) => Promise<FolderMeta>;
  onRenameFolder: (id: string, name: string, icon?: string | null) => Promise<void>;
```

2f. `FolderDialogState` (~line 592): rename variant becomes `{ mode: "rename"; id: string; currentName: string; currentIcon?: string }`.

2g. `handleRenameFolder` (~line 636):
```ts
  const handleRenameFolder = (id: string, currentName: string, currentIcon?: string) => {
    setFolderDialog({ mode: "rename", id, currentName, currentIcon });
  };
```

2h. `handleFolderDialogSubmit` (~line 640):
```ts
  const handleFolderDialogSubmit = async (name: string, icon: string | null) => {
    if (!folderDialog) return;
    try {
      if (folderDialog.mode === "create") {
        await onCreateFolder(name, icon);
      } else if (folderDialog.mode === "rename") {
        await onRenameFolder(folderDialog.id, name, icon);
      } else if (folderDialog.mode === "createAndMove") {
        const folder = await onCreateFolder(name, icon);
        await onMoveNote(folderDialog.noteId, folder.id);
      }
    } catch (error) {
      console.error('Folder action failed:', error);
    }
  };
```

2i. Context menu per-folder entry (~line 840): replace `<Folder className="w-3 h-3" />` with `<FolderIcon icon={folder.icon} className="w-3 h-3" />` (the `moveToRoot` entry at ~line 826 keeps `<Folder>`).

2j. Dialog render (~line 1183):
```tsx
      <FolderNameDialog
        open={folderDialog !== null}
        mode={folderDialog?.mode === "rename" ? "rename" : "create"}
        initialValue={folderDialog?.mode === "rename" ? folderDialog.currentName : ""}
        initialIcon={folderDialog?.mode === "rename" ? folderDialog.currentIcon ?? null : null}
        onOpenChange={(open) => { if (!open) setFolderDialog(null); }}
        onSubmit={handleFolderDialogSubmit}
      />
```

- [ ] **Step 3: DashboardSidebar.tsx** — update the two prop signatures (lines 92-93):
```ts
  onCreateFolder: (name: string, icon?: string | null) => Promise<FolderMeta>;
  onRenameFolder: (id: string, name: string, icon?: string | null) => Promise<void>;
```
(Pass-through at lines 248-249 unchanged.)

- [ ] **Step 4: Dashboard.tsx** — line 302:
```tsx
        onRenameFolder={async (id, name, icon) => { await renameFolder(id, name, icon); }}
```
(`onCreateFolder={createFolder}` at lines 301/366 stays — `useFolders.createFolder` already has the widened signature from Task 4.)

- [ ] **Step 5: NotesEditor.tsx** — line 33:
```ts
  onCreateFolder: (name: string, icon?: string | null) => Promise<FolderMeta>;
```

- [ ] **Step 6: NotesEditorTitleBar.tsx**

6a. Add import `FolderIcon` (keep `Folder` — used by `moveToRoot`). Line 30 signature:
```ts
  onCreateFolder: (name: string, icon?: string | null) => Promise<FolderMeta>;
```

6b. Badge menu per-folder entry (~line 85): `<FolderIcon icon={folder.icon} className="w-3 h-3" />` (moveToRoot at ~line 69 keeps `<Folder>`).

6c. Badge itself (~line 177): replace `<Folder className="notes-folder-badge-icon w-3 h-3" />` with `<FolderIcon icon={activeFolder?.icon} className="notes-folder-badge-icon w-3 h-3" />`.

6d. Create-folder dialog (~line 200):
```tsx
        onSubmit={(name, icon) => {
          const noteId = createFolderForNoteId;
          if (!noteId) return;
          void onCreateFolder(name, icon).then((folder) => onMoveNote(noteId, folder.id));
        }}
```

- [ ] **Step 7: NotesEditorHeader.tsx** — add import `FolderIcon`; the `Folder` lucide import becomes unused → REMOVE it from the import list. Line 80: replace `<Folder className="note-breadcrumb-icon w-3 h-3" />` with `<FolderIcon icon={folder?.icon} className="note-breadcrumb-icon w-3 h-3" />` (unfiled → `folder` is null → default glyph, correct).

- [ ] **Step 8: CHANGELOG.md** — under the `### Added` section of the unreleased/current block (same block the PR3 entry lives in), add:

```markdown
- **Folder emojis** — pick an emoji per folder (curated grid + free input) shown in the sidebar, move-to menus and editor breadcrumb; synced across devices.
```

- [ ] **Step 9: Verify**

Run: `pnpm build` — expected clean (this catches any missed caller of the widened signatures).
Run: `pnpm test` — expected **473 tests / 65 files** all green (451 + 4 mapping + 2 schemas + 2 merge + 2 folders-store + 6 emoji + 6 dialog; 2 new test files: `emoji.test.ts`, `FolderNameDialog.test.tsx`).

- [ ] **Step 10: Commit**

```bash
git add src/components/notes/FolderIcon.tsx src/components/notes/NotesSidebarSection.tsx src/components/dashboard/DashboardSidebar.tsx src/components/Dashboard.tsx src/components/notes/NotesEditor/NotesEditor.tsx src/components/notes/NotesEditor/NotesEditorTitleBar.tsx src/components/notes/NotesEditor/NotesEditorHeader.tsx CHANGELOG.md
git commit -m "feat: show folder emoji across sidebar, menus and breadcrumb"
```

---

### Task 8: Prod deployment (CONTROLLER-EXECUTED — not a subagent task)

Executed by the session controller during the PR, before merge. Order matters: the new sync-push stamps `icon` on every folder-upsert, so the column must exist first.

- [ ] **Step 1:** `pnpm exec supabase db push` (applies `<TIMESTAMP>_user_folders_icon.sql`).
- [ ] **Step 2:** `pnpm exec supabase functions deploy sync-push`.
- [ ] **Step 3:** NO redeploy of `account-export` — zero code diff (`select("*")` picks up the new column dynamically). State this explicitly in the final report.
- [ ] **Step 4:** Verify: `pnpm exec supabase migrations list` shows the migration as applied remotely.
- [ ] **Step 5:** End-of-PR deployment statement (required format): "appliqué en prod : oui/non — db push fait/restant — reste à faire : …".

Safety note: deploying during the PR is safe — the additive nullable column is invisible to the current released client, and the new sync-push treats an absent `icon` as `null` (exactly today's state).
