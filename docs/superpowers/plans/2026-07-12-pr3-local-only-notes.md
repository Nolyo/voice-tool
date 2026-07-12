# PR 3 — Local-Only Note Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toggle explicite « note locale » par note : tant qu'il est actif, la note n'est jamais poussée au cloud ; la bascule synced → locale tombstone la row cloud (la note disparaît des autres appareils, la copie locale reste intacte) ; la bascule inverse re-pousse la note entière. En bonus, une note au contenu vide n'est plus poussée.

**Architecture:** Un champ `local_only: bool` (serde default) sur `NoteMeta` Rust + une commande `set_note_local_only`. Côté TS, un prédicat pur `shouldPushNote(meta, content)` (nouveau module `src/lib/sync/note-push-gate.ts`) regroupe les trois raisons de ne pas pousser (localOnly, contenu vide, cap de taille) et est consommé par `notes-store` ET `SyncContext.fullPush`. Un garde **pull** dans `applyRemoteNote` empêche le tombstone cloud (créé par la bascule) de détruire la copie locale de l'appareil source — sans lui, le serveur stampe `updated_at: now` sur le tombstone qui gagnerait le LWW. UI : bouton cloud/cloud-off dans l'en-tête éditeur, entrée menu contextuel sidebar, indicateur cloud-off sur l'item sidebar, garde dans le popover de partage public.

**Tech Stack:** Rust (serde, Tauri command), TypeScript, Vitest (+ jsdom/@testing-library pour ShareNoteButton), react-i18next.

**Spec:** `docs/superpowers/specs/2026-07-12-ux-improvements-multi-pr-design.md` (section PR 3)

## Global Constraints

- Branche `main` protégée : jamais de commit direct, la PR part de la branche `feat/local-only-notes`.
- Aucune migration DB, aucun changement d'Edge Function : le champ est purement local, `mapping.ts` ne le transporte JAMAIS vers le cloud (ni `mapNoteToCloud` ni `mapNoteFromCloud` ne mentionnent `localOnly`).
- Toute string UI passe par react-i18next — **title et aria-label compris** — clés ajoutées dans `src/locales/fr.json` ET `src/locales/en.json` (les 2 seules locales).
- CHANGELOG en anglais.
- Sémantique de bascule (spec, validée) : synced → locale = enqueue `note-delete` (tombstone cloud 30 j) ; locale → synced = enqueue un `note-upsert` complet (le serveur force `deleted_at: null` sur les upserts, donc le tombstone est levé).
- Garde tombstone existante de `notes-store.applyRemoteNote` (no-op si pas de note locale ET row cloud tombstonée) : inchangée.
- Suite de tests : `pnpm test` (vitest run). Base avant cette PR : **436 tests / 62 fichiers**. Attendu en fin de PR : **451 tests / 63 fichiers**.
- Tests Rust : `cargo test --lib notes::tests` depuis `src-tauri/` avec l'env Windows requis (voir Task 1). Base avant cette PR : 8 tests dans `notes::tests`. Attendu : 11.

## Setup (avant Task 1)

```bash
git checkout main && git pull
git checkout -b feat/local-only-notes
git add docs/superpowers/plans/2026-07-12-pr3-local-only-notes.md
git commit -m "docs: add PR3 local-only notes plan"
```

---

### Task 1: Rust — champ `local_only` + commande `set_note_local_only`

**Files:**
- Modify: `src-tauri/src/notes.rs` (struct `NoteMeta` ligne 10, constructeurs lignes 150 et 237, nouvelle commande après `toggle_note_favorite`, tests mod ligne 546+)
- Modify: `src-tauri/src/lib.rs` (enregistrement de la commande, bloc `notes::*` vers la ligne 139)

**Interfaces:**
- Consumes: rien.
- Produces:
  - `NoteMeta.local_only: bool` — sérialisé `localOnly` en camelCase, `#[serde(default)]` (défaut `false`, rétro-compat avec les note.json existants).
  - Commande Tauri `set_note_local_only(id: String, local_only: bool) -> Result<NoteMeta, String>` — écrit le flag dans note.json, **ne bump PAS `updated_at`** (même politique que `toggle_note_favorite` : le flag est une politique de sync locale, pas un changement de contenu), retourne la meta à jour. Consommée par Task 3 via `invoke("set_note_local_only", { id, localOnly })`.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `src-tauri/src/notes.rs`, module `tests`, ajouter après `note_meta_deserializes_without_deleted_at_key` :

```rust
    #[test]
    fn note_meta_roundtrips_local_only_true() {
        let mut meta = make_meta(None);
        meta.local_only = true;
        let json = serde_json::to_string(&meta).expect("serialize");
        // camelCase rename → JSON key is `localOnly`
        assert!(
            json.contains("\"localOnly\":true"),
            "expected localOnly in JSON, got: {}",
            json
        );
        let decoded: NoteMeta = serde_json::from_str(&json).expect("deserialize");
        assert!(decoded.local_only);
    }

    #[test]
    fn note_meta_defaults_local_only_false_on_legacy_json() {
        // Backward compat: note.json files written before PR3 have no localOnly key.
        let legacy_json = r#"{
            "id": "abc",
            "title": "Legacy Note",
            "createdAt": "2026-05-19T10:00:00Z",
            "updatedAt": "2026-05-19T10:00:00Z",
            "favorite": false,
            "order": 0
        }"#;
        let meta: NoteMeta = serde_json::from_str(legacy_json).expect("deserialize legacy");
        assert!(!meta.local_only);
    }

    #[test]
    fn import_note_payload_preserves_local_only_via_serde() {
        // import_note_for_backup serializes the meta exactly as received —
        // a restored local-only note must stay local-only.
        let mut meta = make_meta(None);
        meta.local_only = true;
        let payload = serde_json::to_string_pretty(&meta).expect("serialize");
        let restored: NoteMeta = serde_json::from_str(&payload).expect("deserialize");
        assert!(restored.local_only);
        assert_eq!(restored.id, meta.id);
    }
```

- [ ] **Step 2: Vérifier qu'ils échouent (erreur de compilation)**

Run (Bash tool, depuis `src-tauri/`) :

```bash
export PATH="$PATH:/c/Program Files/CMake/bin"
LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo test --lib notes::tests
```

Expected: FAIL — `no field 'local_only' on type NoteMeta` (erreur de compilation ; en Rust c'est l'équivalent du test rouge).

Note : si la compilation échoue avec une erreur cmake/MAX_PATH liée à Vulkan, relancer avec `--no-default-features` (fallback CPU documenté dans CLAUDE.md).

- [ ] **Step 3: Implémenter**

3a. Dans la struct `NoteMeta` (ligne 10), ajouter en dernier champ, après `deleted_at` :

```rust
    #[serde(default)]
    pub local_only: bool,
```

3b. Mettre à jour les TROIS constructeurs de `NoteMeta` en ajoutant `local_only: false,` en dernier champ :
- `migrate_notes_from_store` (le `let meta = NoteMeta {` ligne ~150) ;
- `create_note` (le `let meta = NoteMeta {` ligne ~237) ;
- `make_meta` dans le module tests (ligne ~551).

3c. Ajouter la commande après `toggle_note_favorite` (après la ligne ~347) :

```rust
/// Toggle whether a note is "local only" (never synced to the cloud).
/// Does NOT bump `updated_at`: the flag is a local sync policy, not a content
/// change — same policy as `toggle_note_favorite`. The cloud reconciliation
/// (tombstone / re-upsert) is handled by the frontend notes-store.
#[tauri::command]
pub async fn set_note_local_only(
    app_handle: AppHandle,
    id: String,
    local_only: bool,
) -> Result<NoteMeta, String> {
    let notes_dir = get_notes_dir(&app_handle).map_err(|e| e.to_string())?;
    let note_dir = notes_dir.join(&id);

    if !note_dir.exists() {
        return Err(format!("Note not found: {}", id));
    }

    let mut meta = read_note_meta(&note_dir).map_err(|e| e.to_string())?;
    meta.local_only = local_only;

    let meta_json = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    fs::write(note_dir.join("note.json"), meta_json).map_err(|e| e.to_string())?;

    Ok(meta)
}
```

3d. Dans `src-tauri/src/lib.rs`, dans le bloc `invoke_handler`, ajouter après `notes::toggle_note_favorite,` :

```rust
            notes::set_note_local_only,
```

- [ ] **Step 4: Vérifier que les tests passent**

Run (même env que Step 2) :

```bash
export PATH="$PATH:/c/Program Files/CMake/bin"
LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo test --lib notes::tests
```

Expected: PASS — 11 tests (8 existants + 3 nouveaux). La compilation du crate valide aussi l'enregistrement lib.rs.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/notes.rs src-tauri/src/lib.rs
git commit -m "feat: add local_only flag and set_note_local_only command to notes backend"
```

---

### Task 2: Prédicat pur `shouldPushNote` + types TS

**Files:**
- Create: `src/lib/sync/note-push-gate.ts`
- Test: `src/lib/sync/note-push-gate.test.ts`
- Modify: `src/lib/sync/types.ts` (interface `LocalNoteMeta`, ligne ~160)
- Modify: `src/hooks/useNotes.ts` (interface `NoteMeta`, ligne ~38)
- Modify: `src/lib/sync/backups.ts` (interface `BackupNoteMeta`, ligne ~15)

**Interfaces:**
- Consumes: `isNoteSyncable(content: string): boolean` (existant, `src/lib/sync/note-size.ts`).
- Produces: `export function shouldPushNote(meta: Pick<LocalNoteMeta, "localOnly">, content: string): boolean` — `false` si `meta.localOnly`, si `content.trim() === ""`, ou si le contenu dépasse le cap de taille ; `true` sinon. Consommé par Tasks 3 et 4. Champ `localOnly?: boolean` ajouté aux trois interfaces meta TS.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `src/lib/sync/note-push-gate.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { shouldPushNote } from "./note-push-gate";
import { NOTE_SIZE_LIMIT_BYTES } from "./note-size";

describe("shouldPushNote", () => {
  it("returns false when the note is localOnly, even with valid content", () => {
    expect(shouldPushNote({ localOnly: true }, "<p>hello</p>")).toBe(false);
  });

  it("returns false for empty content", () => {
    expect(shouldPushNote({}, "")).toBe(false);
  });

  it("returns false for whitespace-only content", () => {
    expect(shouldPushNote({}, "   \n\t  ")).toBe(false);
  });

  it("returns false for content over the size cap", () => {
    expect(shouldPushNote({}, "a".repeat(NOTE_SIZE_LIMIT_BYTES + 1))).toBe(false);
  });

  it("returns true for a normal syncable note", () => {
    expect(shouldPushNote({}, "<p>hello</p>")).toBe(true);
  });

  it("returns true at exactly the size limit", () => {
    expect(shouldPushNote({}, "a".repeat(NOTE_SIZE_LIMIT_BYTES))).toBe(true);
  });

  it("treats an explicit localOnly: false like an absent flag", () => {
    expect(shouldPushNote({ localOnly: false }, "<p>hello</p>")).toBe(true);
  });
});
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `pnpm exec vitest run src/lib/sync/note-push-gate.test.ts`
Expected: FAIL — module `./note-push-gate` introuvable.

- [ ] **Step 3: Implémenter**

3a. Créer `src/lib/sync/note-push-gate.ts` :

```ts
import type { LocalNoteMeta } from "./types";
import { isNoteSyncable } from "./note-size";

/**
 * Single push-gate predicate for notes — the ONE place that decides whether a
 * note may be enqueued/pushed to the cloud (spec 2026-07-12, PR 3). Consumed
 * by both `notes-store` (per-mutation enqueue) and `SyncContext.fullPush`
 * (initial scan) so the two paths can never disagree.
 *
 * A note is NOT pushed when:
 * - `localOnly` is set: the user explicitly opted this note out of sync;
 * - its content is empty (fresh `create_note` output — the first non-empty
 *   update pushes the initial upsert; sync-push does upserts, so no
 *   create-op dependency);
 * - it exceeds the per-note size cap (see `note-size.ts` — an oversized note
 *   would poison the whole push batch server-side).
 */
export function shouldPushNote(
  meta: Pick<LocalNoteMeta, "localOnly">,
  content: string
): boolean {
  if (meta.localOnly) return false;
  if (content.trim() === "") return false;
  return isNoteSyncable(content);
}
```

3b. Dans `src/lib/sync/types.ts`, interface `LocalNoteMeta`, ajouter après `deletedAt?: string;` :

```ts
  /** True = never synced to the cloud (explicit per-note opt-out, PR3). */
  localOnly?: boolean;
```

3c. Dans `src/hooks/useNotes.ts`, interface `NoteMeta`, ajouter après `order: number;` :

```ts
  localOnly?: boolean;
```

3d. Dans `src/lib/sync/backups.ts`, interface `BackupNoteMeta`, ajouter après la ligne `deletedAt?: string | null;` :

```ts
  /** True = never synced to the cloud. Round-trips verbatim through restore. */
  localOnly?: boolean;
```

(Aucun changement de logique dans backups.ts : `snapshotNotes` passe la meta Rust telle quelle et le restore repasse par `import_note_for_backup`, donc le flag voyage déjà à runtime — l'ajout documente le contrat de type.)

- [ ] **Step 4: Vérifier que les tests passent**

Run: `pnpm exec vitest run src/lib/sync/note-push-gate.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/note-push-gate.ts src/lib/sync/note-push-gate.test.ts src/lib/sync/types.ts src/hooks/useNotes.ts src/lib/sync/backups.ts
git commit -m "feat: add shouldPushNote gate and localOnly meta field (TS)"
```

---

### Task 3: notes-store — gate, bascule `setNoteLocalOnlySynced`, garde pull

**Files:**
- Modify: `src/lib/sync/notes-store.ts`
- Test: `src/lib/sync/notes-store.test.ts`

**Interfaces:**
- Consumes: `shouldPushNote` (Task 2), commande `set_note_local_only` (Task 1), `enqueue`/`isSyncActive`/`mapNoteToCloud`/`cancelNoteUpdatePush` (existants).
- Produces: `export async function setNoteLocalOnlySynced(id: string, localOnly: boolean): Promise<LocalNoteMeta>` — consommé par `useNotes` (Task 5). Comportements modifiés : `createNoteSynced` n'enqueue plus jamais (contenu vide à la création) ; `enqueueNoteUpsertIfSyncable` saute désormais localOnly + vide en plus du cap ; `applyRemoteNote` ignore toute row cloud dont la note locale est `localOnly` ; `scanOversizedNoteCount` ignore les notes `localOnly`.

- [ ] **Step 1: Adapter les tests existants et écrire les nouveaux (qui échouent)**

Dans `src/lib/sync/notes-store.test.ts` :

1a. Ajouter les imports : dans le bloc `import { ... } from "./notes-store";`, ajouter `setNoteLocalOnlySynced` et `scheduleNoteUpdatePush`.

1b. **Remplacer intégralement** le bloc `describe("createNoteSynced", ...)` (les 5 tests actuels) par :

```ts
describe("createNoteSynced", () => {
  it("does NOT enqueue on create — new notes are empty, first non-empty update pushes", async () => {
    invokeHandlers["create_note"] = (args) => {
      expect(args).toEqual({ folderId: "fld" });
      return makeMeta({ id: "new-id", folderId: "fld" });
    };
    const result = await createNoteSynced("fld");
    expect(result.id).toBe("new-id");
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("invokes create_note with folderId=null when called with null", async () => {
    invokeHandlers["create_note"] = (args) => {
      expect(args).toEqual({ folderId: null });
      return makeMeta();
    };
    await createNoteSynced(null);
  });
});
```

1c. Dans le bloc `describe("updateNoteSynced", ...)`, ajouter après le test `"local write succeeds even if enqueue throws"` :

```ts
  it("does NOT enqueue when the note is localOnly", async () => {
    const meta = makeMeta({ id: "lo2", localOnly: true });
    invokeHandlers["update_note"] = () => meta;
    const result = await updateNoteSynced("lo2", "<p>body</p>", "T");
    expect(result).toEqual(meta);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("does NOT enqueue when sync gate is inactive", async () => {
    gateActive = false;
    invokeHandlers["update_note"] = () => makeMeta({ id: "g0" });
    await updateNoteSynced("g0", "<p>x</p>", "t");
    expect(enqueueMock).not.toHaveBeenCalled();
    gateActive = true; // restore for other tests
  });

  it("DOES enqueue when sync gate is active", async () => {
    gateActive = true;
    invokeHandlers["update_note"] = () => makeMeta({ id: "g1" });
    await updateNoteSynced("g1", "<p>x</p>", "t");
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });
```

(Ces deux tests de gate remplacent les versions « create » supprimées en 1b — la création n'enqueue plus jamais, donc elle ne peut plus discriminer l'état du gate.)

1d. Ajouter un nouveau bloc `describe("setNoteLocalOnlySynced", ...)` après le bloc `describe("moveNoteToFolderSynced", ...)` :

```ts
describe("setNoteLocalOnlySynced", () => {
  it("localOnly=true → invokes set_note_local_only then enqueues note-delete", async () => {
    const meta = makeMeta({ id: "d1", localOnly: true });
    invokeHandlers["set_note_local_only"] = (args) => {
      expect(args).toEqual({ id: "d1", localOnly: true });
      return meta;
    };
    const result = await setNoteLocalOnlySynced("d1", true);
    expect(result).toEqual(meta);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const op = enqueueMock.mock.calls[0][0];
    if (op.kind !== "note-delete") throw new Error("expected note-delete");
    expect(op.id).toBe("d1");
  });

  it("localOnly=true cancels a pending debounced upsert (delete must be the only op)", async () => {
    vi.useFakeTimers();
    try {
      const meta = makeMeta({ id: "t1" });
      invokeHandlers["set_note_local_only"] = () => ({ ...meta, localOnly: true });
      scheduleNoteUpdatePush("t1", meta, "<p>typed</p>", 2000);
      await setNoteLocalOnlySynced("t1", true);
      await vi.runAllTimersAsync();
      const kinds = enqueueMock.mock.calls.map((c) => c[0].kind);
      expect(kinds).toEqual(["note-delete"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("localOnly=false → re-enqueues a full note-upsert with current content", async () => {
    const meta = makeMeta({ id: "s1", title: "Back" });
    invokeHandlers["set_note_local_only"] = (args) => {
      expect(args).toEqual({ id: "s1", localOnly: false });
      return meta;
    };
    invokeHandlers["read_note"] = () => ({ meta, content: "<p>body</p>" });
    const result = await setNoteLocalOnlySynced("s1", false);
    expect(result).toEqual(meta);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const op = enqueueMock.mock.calls[0][0];
    if (op.kind !== "note-upsert") throw new Error("expected note-upsert");
    expect(op.note.id).toBe("s1");
    expect(op.note.content_html).toBe("<p>body</p>");
  });

  it("localOnly=false with empty content does NOT enqueue", async () => {
    const meta = makeMeta({ id: "e1" });
    invokeHandlers["set_note_local_only"] = () => meta;
    invokeHandlers["read_note"] = () => ({ meta, content: "" });
    await setNoteLocalOnlySynced("e1", false);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("does NOT enqueue when sync gate is inactive", async () => {
    gateActive = false;
    invokeHandlers["set_note_local_only"] = () =>
      makeMeta({ id: "g2", localOnly: true });
    await setNoteLocalOnlySynced("g2", true);
    expect(enqueueMock).not.toHaveBeenCalled();
    gateActive = true; // restore for other tests
  });
});
```

1e. Dans le bloc `describe("applyRemoteNote", ...)`, ajouter en fin de bloc :

```ts
  it("skips the cloud row entirely when the local note is localOnly", async () => {
    const localMeta = makeMeta({
      id: "lo1",
      localOnly: true,
      updatedAt: "2026-05-19T10:00:00Z",
    });
    invokeHandlers["read_note"] = () => ({ meta: localMeta, content: "<p>local</p>" });
    let imported = false;
    invokeHandlers["import_note_for_backup"] = () => {
      imported = true;
      return undefined;
    };
    // Fresh server tombstone (newer than local) — would win LWW and soft-delete
    // the local copy without the guard. This is the synced → local toggle's own
    // tombstone coming back on the source device's next pull.
    const row = makeCloud({
      id: "lo1",
      deleted_at: "2026-05-19T12:00:00Z",
      updated_at: "2026-05-19T12:00:00Z",
    });
    await applyRemoteNote(row);
    expect(imported).toBe(false);
  });
```

1f. Dans le bloc `describe("scanOversizedNoteCount", ...)`, ajouter en fin de bloc :

```ts
  it("does not count an oversized local-only note (it is not a sync candidate)", async () => {
    const bigLocal = makeMeta({ id: "biglo", localOnly: true });
    invokeHandlers["list_notes"] = () => [bigLocal];
    invokeHandlers["read_note"] = () => ({
      meta: bigLocal,
      content: "a".repeat(NOTE_SIZE_LIMIT_BYTES + 1),
    });
    expect(await scanOversizedNoteCount()).toBe(0);
  });
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `pnpm exec vitest run src/lib/sync/notes-store.test.ts`
Expected: FAIL — `setNoteLocalOnlySynced` non exporté ; le test de création échoue (enqueue encore appelé) ; les tests localOnly échouent (pas de gate).

- [ ] **Step 3: Implémenter dans `src/lib/sync/notes-store.ts`**

3a. Ajouter l'import (après la ligne `import { isNoteSyncable } from "./note-size";`) :

```ts
import { shouldPushNote } from "./note-push-gate";
```

(L'import `isNoteSyncable` reste : `scanOversizedNoteCount` l'utilise toujours.)

3b. Remplacer le corps de `enqueueNoteUpsertIfSyncable` (le prédicat passe de `isNoteSyncable(content)` à `shouldPushNote(meta, content)`) :

```ts
async function enqueueNoteUpsertIfSyncable(
  meta: LocalNoteMeta,
  content: string,
  context: string
): Promise<boolean> {
  try {
    if (!isSyncActive()) return false;
    if (!shouldPushNote(meta, content)) {
      console.warn(
        `[notes-store] note ${meta.id} skipped (local-only, empty, or over size cap) on ${context}`
      );
      return false;
    }
    await enqueue({ kind: "note-upsert", note: mapNoteToCloud(meta, content) });
    return true;
  } catch (e) {
    console.warn(`[notes-store] enqueue failed for ${context}`, e);
    return false;
  }
}
```

Conserver le docblock existant de la fonction mais remplacer sa première phrase par : `Enqueue a note-upsert, but ONLY when the push gate allows it (shouldPushNote: not local-only, not empty, within the cloud size cap).` Le reste du docblock (explication du batch poisoning) reste.

3c. Remplacer intégralement `createNoteSynced` par :

```ts
export async function createNoteSynced(
  folderId: string | null
): Promise<LocalNoteMeta> {
  // A newly-created note has empty content, and empty notes are never pushed
  // (shouldPushNote): the first non-empty update enqueues the initial upsert.
  // sync-push does upserts, so nothing depends on a create-time op.
  return invoke<LocalNoteMeta>("create_note", { folderId });
}
```

3d. Dans `scanOversizedNoteCount`, remplacer la ligne `if (m.deletedAt) continue;` par :

```ts
    if (m.deletedAt) continue;
    if (m.localOnly) continue; // local-only notes are not sync candidates
```

3e. Ajouter la fonction `setNoteLocalOnlySynced` après `moveNoteToFolderSynced` :

```ts
/**
 * Toggle the per-note "local only" flag and reconcile the cloud state.
 *
 * - synced → local (`localOnly: true`): the note must disappear from the
 *   cloud (and from other devices at their next pull), so we enqueue a
 *   `note-delete` tombstone. The local copy stays intact — `applyRemoteNote`
 *   ignores cloud rows for local-only notes, so the tombstone can never
 *   destroy this device's copy. Any pending debounced upsert is cancelled
 *   FIRST: it would otherwise fire after the delete and resurrect the note.
 * - local → synced (`localOnly: false`): re-push the full note (sync-push
 *   upserts force `deleted_at: null` server-side, clearing the tombstone).
 *
 * Enqueue failures are swallowed (local write is the source of truth).
 */
export async function setNoteLocalOnlySynced(
  id: string,
  localOnly: boolean
): Promise<LocalNoteMeta> {
  const meta = await invoke<LocalNoteMeta>("set_note_local_only", {
    id,
    localOnly,
  });
  try {
    if (isSyncActive()) {
      if (localOnly) {
        cancelNoteUpdatePush(id);
        await enqueue({ kind: "note-delete", id });
      } else {
        const { content } = await readNote(id);
        await enqueueNoteUpsertIfSyncable(meta, content, "make-synced");
      }
    }
  } catch (e) {
    console.warn("[notes-store] enqueue failed for set-local-only", e);
  }
  return meta;
}
```

3f. Dans `applyRemoteNote`, insérer le garde juste après le bloc `try/catch` qui lit `local` (avant le garde tombstone `if (!local && row.deleted_at !== null)`) :

```ts
  if (local?.meta.localOnly) {
    // A local-only note ignores its cloud counterpart entirely. In particular,
    // the tombstone created by the synced → local toggle comes back on this
    // device's next pull with a fresh server-stamped updated_at — it would win
    // LWW and soft-delete the local copy without this guard.
    return;
  }
```

- [ ] **Step 4: Vérifier que tout passe**

Run: `pnpm exec vitest run src/lib/sync/notes-store.test.ts`
Expected: PASS — 30 tests. Décompte : 23 avant cette tâche ; le bloc `createNoteSynced` passe de 5 tests à 2 (−3) ; +3 dans `updateNoteSynced` ; +5 `setNoteLocalOnlySynced` ; +1 `applyRemoteNote` ; +1 `scanOversizedNoteCount` → 23 − 3 + 10 = 30.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/notes-store.ts src/lib/sync/notes-store.test.ts
git commit -m "feat: local-only push gate, toggle reconciliation and pull guard in notes-store"
```

---

### Task 4: SyncContext.fullPush + compteurs (SyncActivationModal, AccountSection)

**Files:**
- Modify: `src/contexts/SyncContext.tsx` (boucle notes de `fullPush`, lignes ~457-482)
- Modify: `src/components/settings/sections/SyncActivationModal.tsx` (comptage, lignes ~42-49)
- Modify: `src/components/settings/sections/AccountSection.tsx` (`SyncedInventoryGrid`, lignes ~575-586)

**Interfaces:**
- Consumes: `shouldPushNote` (Task 2), `LocalNoteMeta.localOnly` (Task 2).
- Produces: rien de nouveau — comportements : `fullPush` ne pousse ni les notes `localOnly` ni les notes vides ; les compteurs « Notes » des deux écrans excluent les notes `localOnly`.

Pas de test unitaire dédié : `SyncContext` et ces deux composants n'ont pas de harnais (mocks Tauri lourds) ; la logique décisionnelle est déjà couverte par les tests de `shouldPushNote` (Task 2). Vérification : compilation + suite complète + smoke test final.

- [ ] **Step 1: `SyncContext.tsx`**

1a. Ajouter l'import (à côté de `import { isNoteSyncable } from "@/lib/sync/note-size";`) :

```ts
import { shouldPushNote } from "@/lib/sync/note-push-gate";
```

1b. Dans `fullPush`, remplacer la boucle notes actuelle :

```ts
      const notesMeta = await listNotes();
      let oversized = 0;
      for (const nm of notesMeta) {
        if (nm.deletedAt) continue;
        try {
          const { content } = await readNote(nm.id);
          if (!isNoteSyncable(content)) {
            oversized++;
            flog(
              `[sync] note ${nm.id} ("${nm.title}") skipped (over 1 MB sync cap)`,
              "warn"
            );
            continue;
          }
          ops.push({ kind: "note-upsert", note: mapNoteToCloud(nm, content) });
        } catch (e) {
          flog(`[sync] readNote failed for ${nm.id}: ${String(e)}`, "warn");
        }
      }
      setOversizedNoteCount(oversized);
```

par :

```ts
      const notesMeta = await listNotes();
      let oversized = 0;
      for (const nm of notesMeta) {
        if (nm.deletedAt) continue;
        // Local-only notes never leave the device — skip before even reading.
        if (nm.localOnly) continue;
        try {
          const { content } = await readNote(nm.id);
          if (!isNoteSyncable(content)) {
            oversized++;
            flog(
              `[sync] note ${nm.id} ("${nm.title}") skipped (over sync size cap)`,
              "warn"
            );
            continue;
          }
          // Empty notes have nothing to push (fresh create_note output).
          if (!shouldPushNote(nm, content)) continue;
          ops.push({ kind: "note-upsert", note: mapNoteToCloud(nm, content) });
        } catch (e) {
          flog(`[sync] readNote failed for ${nm.id}: ${String(e)}`, "warn");
        }
      }
      setOversizedNoteCount(oversized);
```

- [ ] **Step 2: `SyncActivationModal.tsx`**

Dans le `useEffect` de comptage, remplacer :

```ts
      const c = {
        snippets: sn.length,
        words: d.words.length,
        notes: n.length,
        folders: f.length,
      };
```

par :

```ts
      const c = {
        snippets: sn.length,
        words: d.words.length,
        // Local-only notes are excluded: they will never be uploaded.
        notes: n.filter((m) => !m.localOnly).length,
        folders: f.length,
      };
```

- [ ] **Step 3: `AccountSection.tsx`**

Dans `SyncedInventoryGrid`, remplacer :

```ts
      setCounts({
        snippets: sn.length,
        words: d.words.length,
        notes: n.length,
        folders: f.length,
      });
```

par :

```ts
      setCounts({
        snippets: sn.length,
        words: d.words.length,
        // Local-only notes are excluded: they are not part of the synced set.
        notes: n.filter((m) => !m.localOnly).length,
        folders: f.length,
      });
```

- [ ] **Step 4: Vérifier compilation + suite**

Run: `pnpm build` puis `pnpm test`
Expected: build clean ; suite complète verte — 450 tests / 63 fichiers (436 base + 7 Task 2 + 7 Task 3).

- [ ] **Step 5: Commit**

```bash
git add src/contexts/SyncContext.tsx src/components/settings/sections/SyncActivationModal.tsx src/components/settings/sections/AccountSection.tsx
git commit -m "feat: exclude local-only notes from fullPush and synced-inventory counters"
```

---

### Task 5: useNotes.toggleLocalOnly + en-tête éditeur + garde partage + i18n

**Files:**
- Modify: `src/hooks/useNotes.ts` (nouvelle mutation + export)
- Modify: `src/components/Dashboard.tsx` (destructuration + prop vers `NotesEditor`)
- Modify: `src/components/notes/NotesEditor/NotesEditor.tsx` (prop transit)
- Modify: `src/components/notes/NotesEditor/NotesEditorContent.tsx` (prop transit)
- Modify: `src/components/notes/NotesEditor/NotesEditorHeader.tsx` (bouton cloud/cloud-off)
- Modify: `src/components/notes/NotesEditor/ShareNoteButton.tsx` (garde note locale)
- Test: `src/components/notes/NotesEditor/ShareNoteButton.test.tsx` (+1 test)
- Modify: `src/locales/fr.json`, `src/locales/en.json`

**Interfaces:**
- Consumes: `setNoteLocalOnlySynced` (Task 3), `NoteMeta.localOnly` (Task 2).
- Produces: `useNotes().toggleLocalOnly(id: string): Promise<void>` — consommé aussi par Task 6 ; prop `onToggleLocalOnly: (id: string) => void` sur `NotesEditor`/`NotesEditorContent`/`NotesEditorHeader` ; clés i18n `notes.localOnly.{makeLocal,makeSynced,indicator,headerLabel}` et `notes.share.localOnlyWarn` (utilisées aussi par Task 6).

- [ ] **Step 1: Écrire le test qui échoue (garde partage)**

Dans `src/components/notes/NotesEditor/ShareNoteButton.test.tsx`, ajouter en fin de `describe("ShareNoteButton", ...)` :

```tsx
  it("shows the local-only warning and hides the create button for a local note", () => {
    const localNote = { ...note, localOnly: true };
    render(<ShareNoteButton note={localNote as never} />);
    fireEvent.click(screen.getByRole("button", { name: /Share|Partager/i }));
    expect(screen.getByText(/local/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Create a public link|Créer/i })
    ).not.toBeInTheDocument();
  });
```

Run: `pnpm exec vitest run src/components/notes/NotesEditor/ShareNoteButton.test.tsx`
Expected: FAIL — le bouton « Create a public link » est encore rendu.

- [ ] **Step 2: `ShareNoteButton.tsx` — garde note locale**

Un lien public lit la version cloud de la note ; une note locale n'en a pas (ou n'a qu'un tombstone) — créer un lien produirait une page morte. Dans le popover, remplacer le bloc :

```tsx
          {enabled && !active && (
```

par (le bloc warn s'insère AVANT, et la condition gagne `!note.localOnly`) :

```tsx
          {enabled && note.localOnly && (
            <p className="note-share-warn">
              {t("notes.share.localOnlyWarn", { defaultValue: "Cette note est locale (non synchronisée) — désactive « note locale » pour la partager." })}
            </p>
          )}

          {enabled && !note.localOnly && !active && (
```

(La section `enabled && active` reste inchangée : un partage créé avant la bascule reste révocable.)

Run: `pnpm exec vitest run src/components/notes/NotesEditor/ShareNoteButton.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 3: `useNotes.ts` — mutation `toggleLocalOnly`**

3a. Dans l'import depuis `@/lib/sync/notes-store`, ajouter `setNoteLocalOnlySynced`.

3b. Ajouter après la fonction `toggleFavorite` :

```ts
  const toggleLocalOnly = async (id: string): Promise<void> => {
    const current = notes.find(n => n.id === id);
    const updated = await setNoteLocalOnlySynced(id, !current?.localOnly);
    setNotes(prev => prev.map(n => n.id === id ? updated : n));
  };
```

3c. Ajouter `toggleLocalOnly,` dans l'objet retourné par le hook (après `toggleFavorite,`).

- [ ] **Step 4: Transit de la prop jusqu'à l'en-tête**

4a. `src/components/Dashboard.tsx` : ajouter `toggleLocalOnly,` à la destructuration de `useNotes()` (après `toggleFavorite,`), puis passer `onToggleLocalOnly={toggleLocalOnly}` au composant `<NotesEditor ... />` (à côté de `onUpdateNote={updateNote}`).

4b. `src/components/notes/NotesEditor/NotesEditor.tsx` :
- interface `NotesEditorProps` : ajouter `onToggleLocalOnly: (id: string) => void;` après `onUpdateNote` ;
- destructuration du composant : ajouter `onToggleLocalOnly,` ;
- passer `onToggleLocalOnly={onToggleLocalOnly}` au `<NotesEditorContent ... />`.

4c. `src/components/notes/NotesEditor/NotesEditorContent.tsx` :
- interface `NotesEditorContentProps` : ajouter `onToggleLocalOnly: (id: string) => void;` ;
- destructuration : ajouter `onToggleLocalOnly,` ;
- passer `onToggleLocalOnly={onToggleLocalOnly}` au `<NotesEditorHeader ... />`.

- [ ] **Step 5: `NotesEditorHeader.tsx` — bouton cloud/cloud-off**

5a. Imports : remplacer `import { Clock, Folder } from "lucide-react";` par `import { Clock, Cloud, CloudOff, Folder } from "lucide-react";`.

5b. Interface `NotesEditorHeaderProps` : ajouter `onToggleLocalOnly: (id: string) => void;` et l'ajouter à la destructuration du composant.

5c. Dans le JSX, insérer juste avant `<ShareNoteButton note={note} />` :

```tsx
        {note && (
          <button
            type="button"
            className="note-meta-item"
            aria-label={note.localOnly ? t("notes.localOnly.makeSynced") : t("notes.localOnly.makeLocal")}
            title={note.localOnly ? t("notes.localOnly.makeSynced") : t("notes.localOnly.makeLocal")}
            onClick={() => onToggleLocalOnly(note.id)}
          >
            {note.localOnly ? <CloudOff className="w-3 h-3" /> : <Cloud className="w-3 h-3" />}
            {note.localOnly && <span>{t("notes.localOnly.headerLabel")}</span>}
          </button>
        )}
```

(Même pattern bouton que `ShareNoteButton` : `className="note-meta-item"` sur un `<button type="button">`. Le label texte n'apparaît que quand la note est locale — l'état « synchronisée » reste discret, icône seule.)

- [ ] **Step 6: i18n**

6a. `src/locales/fr.json`, dans l'objet `"notes"` (après `"expandAll": "Tout déplier",`) :

```json
    "localOnly": {
      "makeLocal": "Ne plus synchroniser (note locale)",
      "makeSynced": "Synchroniser cette note",
      "indicator": "Note locale — jamais synchronisée",
      "headerLabel": "Locale"
    },
```

et dans l'objet `"notes"."share"` (après `"error": ...`, ajouter une virgule à la ligne précédente) :

```json
      "localOnlyWarn": "Cette note est locale (non synchronisée) — désactive « note locale » pour la partager."
```

6b. `src/locales/en.json`, mêmes emplacements :

```json
    "localOnly": {
      "makeLocal": "Stop syncing (local note)",
      "makeSynced": "Sync this note",
      "indicator": "Local note — never synced",
      "headerLabel": "Local"
    },
```

```json
      "localOnlyWarn": "This note is local (not synced) — turn off \"local note\" to share it."
```

- [ ] **Step 7: Vérifier compilation + suite**

Run: `pnpm build` puis `pnpm test`
Expected: build clean ; 451 tests / 63 fichiers verts.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useNotes.ts src/components/Dashboard.tsx src/components/notes/NotesEditor/NotesEditor.tsx src/components/notes/NotesEditor/NotesEditorContent.tsx src/components/notes/NotesEditor/NotesEditorHeader.tsx src/components/notes/NotesEditor/ShareNoteButton.tsx src/components/notes/NotesEditor/ShareNoteButton.test.tsx src/locales/fr.json src/locales/en.json
git commit -m "feat: local-only toggle in notes editor header, share guard and i18n"
```

---

### Task 6: Sidebar — menu contextuel + indicateur cloud-off + CHANGELOG

**Files:**
- Modify: `src/components/Dashboard.tsx` (prop vers `NotesSidebarSection`)
- Modify: `src/components/notes/NotesSidebarSection.tsx` (props, indicateur `NoteItem`, entrée menu contextuel)
- Modify: `CHANGELOG.md` (section `[Unreleased]`)

**Interfaces:**
- Consumes: `useNotes().toggleLocalOnly` (Task 5), clés i18n `notes.localOnly.*` (Task 5), `NoteMeta.localOnly` (Task 2).
- Produces: rien de nouveau — UI sidebar complète.

- [ ] **Step 1: `Dashboard.tsx`**

Passer `onToggleLocalOnly={toggleLocalOnly}` au composant `<NotesSidebarSection ... />` (à côté de `onToggleFavorite={toggleFavorite}` ; `toggleLocalOnly` est déjà destructuré depuis Task 5).

- [ ] **Step 2: `NotesSidebarSection.tsx`**

2a. Imports lucide : ajouter `Cloud` et `CloudOff` à la liste existante (ordre alphabétique : `ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Clock, Cloud, CloudOff, Folder, FolderPlus, Pencil, Plus, Star, Trash2`).

2b. Interface `NotesSidebarSectionProps` : ajouter après `onToggleFavorite: (id: string) => void;` :

```ts
  onToggleLocalOnly: (id: string) => void;
```

et ajouter `onToggleLocalOnly,` à la destructuration du composant principal (à côté de `onToggleFavorite,`).

2c. Indicateur dans `NoteItem` : insérer entre le `<span className="text-xs flex-1 truncate">{note.title}</span>` et le `<div className="hidden group-hover:flex ...">` :

```tsx
      {note.localOnly && (
        <span
          className="shrink-0"
          style={{ color: "var(--vt-fg-4)" }}
          title={t('notes.localOnly.indicator')}
          aria-label={t('notes.localOnly.indicator')}
        >
          <CloudOff className="w-3 h-3" />
        </span>
      )}
```

(Toujours visible, hors du bloc hover — c'est l'indicateur discret demandé par le spec. `NoteItem` reçoit déjà `t` en prop.)

2d. Entrée menu contextuel : dans `buildContextMenuItems`, ajouter à la fin (après le push de `newFolderAndMove`, avant le `return items;`) :

```tsx
    items.push({ separator: true });
    items.push({
      label: (
        <span className="flex items-center gap-1.5">
          {note.localOnly ? <Cloud className="w-3 h-3" /> : <CloudOff className="w-3 h-3" />}
          {note.localOnly ? t('notes.localOnly.makeSynced') : t('notes.localOnly.makeLocal')}
        </span>
      ),
      onClick: () => { onToggleLocalOnly(note.id); },
    });
```

- [ ] **Step 3: CHANGELOG**

Dans `CHANGELOG.md`, sous `## [Unreleased]` → `### Added`, ajouter :

```markdown
- **Local-only notes** — a per-note "local note" toggle (editor header cloud icon + sidebar context menu) keeps a note out of cloud sync entirely. Switching a synced note to local removes it from the cloud and other devices while keeping the local copy intact; switching back re-uploads it. Empty notes are no longer pushed to the cloud.
```

(Si la section `### Added` n'existe pas sous `[Unreleased]`, la créer.)

- [ ] **Step 4: Vérifier compilation + suite complète**

Run: `pnpm build` puis `pnpm test`
Expected: build clean ; 451 tests / 63 fichiers verts.

- [ ] **Step 5: Commit**

```bash
git add src/components/Dashboard.tsx src/components/notes/NotesSidebarSection.tsx CHANGELOG.md
git commit -m "feat: local-only toggle in notes sidebar context menu with cloud-off indicator"
```

---

### Vérification finale (avant PR)

- [ ] `pnpm test` — 451 tests / 63 fichiers verts.
- [ ] `pnpm build` — compilation TypeScript + Vite OK.
- [ ] `cargo test --lib notes::tests` (env Task 1) — 11 tests verts.
- [ ] Smoke test manuel (nécessite `pnpm tauri dev` lancé par l'utilisateur — ne pas le lancer soi-même) :
  - toggle depuis l'en-tête éditeur → icône bascule, indicateur cloud-off apparaît dans la sidebar, persiste au redémarrage ;
  - menu contextuel sidebar → même bascule ;
  - sync active : bascule synced → locale → la note disparaît de la DB cloud (tombstone) puis, sur un **second appareil**, disparaît au pull — la copie locale de l'appareil source reste intacte (y compris après un pull) ;
  - bascule locale → synced → la note réapparaît au cloud ;
  - popover partage sur une note locale → warning, pas de bouton « créer un lien » ;
  - compteurs (SyncActivationModal + AccountSection) excluent la note locale.
- [ ] Ouvrir la PR vers `main` : `feat/local-only-notes` (contient ce plan).
