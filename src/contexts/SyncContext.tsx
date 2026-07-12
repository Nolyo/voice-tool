import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import {
  extractCloudSettings,
  mapFolderToCloud,
  mapNoteToCloud,
  syncableSettingsChanged,
} from "@/lib/sync/mapping";
import { flog } from "@/lib/flog";
import { pullAll, pushOperations } from "@/lib/sync/client";
import {
  enqueue,
  peekAll,
  peekReadyHead,
  markRetry,
  moveToDeadLetter,
  getDeadLetters,
  MAX_RETRIES_BEFORE_DLQ,
  size as queueSize,
} from "@/lib/sync/queue";
import { applyBatchResults } from "@/lib/sync/apply-batch-results";
import {
  loadSnippets,
  applyRemoteSnippet,
  migrateLegacySnippetsOnce,
} from "@/lib/sync/snippets-store";
import {
  applyRemoteNote,
  flushPendingNoteUpdates,
  listNotes,
  readNote,
  scanOversizedNoteCount,
} from "@/lib/sync/notes-store";
import { isNoteSyncable } from "@/lib/sync/note-size";
import { shouldPushNote } from "@/lib/sync/note-push-gate";
import { applyRemoteFolder, listFolders } from "@/lib/sync/folders-store";
import {
  loadDictionary,
  applyRemoteWord,
  migrateLegacyDictionaryOnce,
} from "@/lib/sync/dictionary-store";
import { mergeSettingsLWW, shouldApplyCloudSettings } from "@/lib/sync/merge";
import { computeNextPullCursor } from "@/lib/sync/pull-cursor";
import { setSyncActive } from "@/lib/sync/sync-gate";
import { ensureCloudProfileId } from "@/lib/sync/cloud-profile";
import type { AppSettings } from "@/lib/settings";
import type { SyncOperation, SyncState, SyncStatus } from "@/lib/sync/types";

const KEY_ENABLED = "enabled";
const KEY_LAST_PULL_AT = "last_pull_at";
const KEY_LAST_PUSHED_SETTINGS_AT = "last_pushed_settings_at";
const KEY_CLOUD_PROFILE_ID = "cloud_profile_id";
// True once the initial full push of local state has completed successfully for
// this profile. Until then, mount re-tries it — so a push that failed (offline,
// an oversized note that has since been trimmed, a transient 5xx) eventually
// completes on a later launch without the user having to toggle sync off/on.
const KEY_INITIAL_PUSH_DONE = "initial_push_done";
const DEBOUNCE_PUSH_MS = 500;
const FOCUS_PULL_IDLE_MS = 5 * 60 * 1000;

export interface SyncContextValue extends SyncState {
  dead_letter_count: number;
  enableSync(): Promise<void>;
  disableSync(): Promise<void>;
  syncNow(): Promise<void>;
  refreshDeadLetters(): Promise<void>;
  notifySettingsChanged(
    previous: AppSettings["settings"],
    current: AppSettings["settings"]
  ): void;
  notifyDictionaryUpserted(word: string): void;
  notifyDictionaryDeleted(word: string): void;
  notifySnippetUpserted(
    snippetId: string,
    label: string,
    content: string,
    shortcut: string | null
  ): void;
  notifySnippetDeleted(snippetId: string): void;
}

export const SyncContext = createContext<SyncContextValue | null>(null);

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

export function SyncProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { settings, updateSettings, subscribeToChanges } = useSettings();
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<SyncStatus>("disabled");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastPullAt, setLastPullAt] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [deadLetterCount, setDeadLetterCount] = useState(0);
  const [oversizedNoteCount, setOversizedNoteCount] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const flushingRef = useRef(false);
  const pushingRef = useRef(false);
  // Always-fresh mirror so stable callbacks (flush, pullAndApply, notify*) can
  // read the latest settings without re-subscribing on every settings change.
  const settingsRef = useRef<AppSettings["settings"]>(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Charger enabled + last_pull_at au mount
  useEffect(() => {
    (async () => {
      const en = await getMeta<boolean>(KEY_ENABLED, false);
      const lp = await getMeta<string | null>(KEY_LAST_PULL_AT, null);
      setEnabled(en);
      setSyncActive(en);
      setLastPullAt(lp);
      setPendingCount(await queueSize());
      setDeadLetterCount((await getDeadLetters()).length);
      setStatus(en ? "idle" : "disabled");
    })();
  }, []);

  const getDeviceId = useCallback(async (): Promise<string> => {
    return invoke<string>("get_or_create_device_id");
  }, []);

  const refreshDeadLetterCount = useCallback(async () => {
    const dlq = await getDeadLetters();
    setDeadLetterCount(dlq.length);
  }, []);

  const flushQueue = useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    setStatus("syncing");
    try {
      const deviceId = await getDeviceId();
      const { id: cloudProfileId } = await ensureCloudProfileId(getMeta, setMeta);
      let sawError = false;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const ready = await peekReadyHead();
        if (!ready) break;
        const pending = await peekAll();
        const batch = pending.slice(0, 50);
        const ops = batch.map((e) => e.operation);
        const resp = await pushOperations(ops, deviceId, cloudProfileId);
        if (!resp.ok) {
          // Whole-batch failure (network, 5xx, 413 quota)
          await markRetry(ready.id, resp.error ?? "push failed");
          const updated = (await peekAll())[0];
          if (
            updated &&
            updated.id === ready.id &&
            updated.retry_count >= MAX_RETRIES_BEFORE_DLQ
          ) {
            await moveToDeadLetter(updated.id, resp.error ?? "max retries");
          }
          if (resp.status === 413) {
            setStatus("quota-exceeded");
          } else {
            setStatus("offline");
          }
          setLastError(resp.error ?? "push failed");
          sawError = true;
          break;
        }
        const { failedCount } = await applyBatchResults(batch, resp.results);

        // Move to DLQ if any entry crossed the retry threshold
        const after = await peekAll();
        for (const e of after) {
          if (e.retry_count >= MAX_RETRIES_BEFORE_DLQ) {
            await moveToDeadLetter(e.id, e.last_error ?? "max retries");
          }
        }

        if (failedCount > 0) {
          setStatus("error");
          setLastError("Some operations failed");
          sawError = true;
          break;
        }
        if (resp.server_time) {
          // Si le batch a poussé un settings-upsert, on note le server_time
          if (batch.some((e) => e.operation.kind === "settings-upsert")) {
            await setMeta(KEY_LAST_PUSHED_SETTINGS_AT, resp.server_time);
          }
        }
      }
      setPendingCount(await queueSize());
      await refreshDeadLetterCount();
      if (!sawError) {
        setStatus("idle");
        setLastError(null);
      }
    } finally {
      flushingRef.current = false;
    }
  }, [getDeviceId, refreshDeadLetterCount]);

  const enqueueAndTry = useCallback(
    async (op: SyncOperation) => {
      if (!enabled) return;
      await enqueue(op);
      setPendingCount(await queueSize());
      void flushQueue();
    },
    [enabled, flushQueue]
  );

  const pullAndApply = useCallback(async (opts?: { forceFull?: boolean }) => {
    // `forceFull` is used by enableSync: it bypasses the stale `enabled` closure
    // (enableSync sets enabled=true but this callback still captured false) AND
    // ignores any residual cursor, so activating sync always does a COMPLETE
    // reconcile instead of an incremental pull that would miss older notes.
    if ((!enabled && !opts?.forceFull) || auth.status !== "signed-in") return;
    setStatus("syncing");
    try {
      const since = opts?.forceFull
        ? null
        : await getMeta<string | null>(KEY_LAST_PULL_AT, null);
      const cloudProfileId = await getMeta<string | null>(KEY_CLOUD_PROFILE_ID, null);
      if (!cloudProfileId) {
        // No cloud partition associated with this profile yet: nothing to pull.
        setStatus("idle");
        return;
      }
      const result = await pullAll(since, cloudProfileId);

      // Settings : LWW → écrire la diff syncable dans le SettingsContext
      if (result.settings) {
        const lastPushedAt = await getMeta<string | null>(
          KEY_LAST_PUSHED_SETTINGS_AT,
          null
        );
        const merged = mergeSettingsLWW(
          settingsRef.current,
          lastPushedAt,
          result.settings
        );
        // A queued local settings push means the user just edited settings on
        // this device — don't let the pulled (stale) cloud value revert it.
        const pendingOps = await peekAll();
        const settingsPushPending = pendingOps.some(
          (e) => e.operation.kind === "settings-upsert"
        );
        if (shouldApplyCloudSettings(merged.action, settingsPushPending)) {
          await updateSettings({
            theme: merged.settings.theme,
            ui_language: merged.settings.ui_language,
            record_hotkey: merged.settings.record_hotkey,
            ptt_hotkey: merged.settings.ptt_hotkey,
            open_window_hotkey: merged.settings.open_window_hotkey,
            insertion_mode: merged.settings.insertion_mode,
            enable_sounds: merged.settings.enable_sounds,
            transcription_provider: merged.settings.transcription_provider,
            local_model_size: merged.settings.local_model_size,
          });
          await setMeta(KEY_LAST_PUSHED_SETTINGS_AT, result.settings.updated_at);
        }
      }

      // Dico
      for (const row of result.dictionary) {
        await applyRemoteWord({
          word: row.word,
          deleted: row.deleted_at !== null,
          updated_at: row.updated_at,
        });
      }

      // Snippets
      for (const row of result.snippets) {
        await applyRemoteSnippet({
          id: row.id,
          label: row.label,
          content: row.content,
          shortcut: row.shortcut,
          created_at: row.created_at,
          updated_at: row.updated_at,
          deleted_at: row.deleted_at,
        });
      }

      // Notes — LWW per item. Per-row try/catch so a single bad row (corrupted
      // local file, fs permission, etc.) does NOT abort the whole batch.
      for (const row of result.notes) {
        try {
          await applyRemoteNote(row);
        } catch (e) {
          flog(`[sync] applyRemoteNote failed for ${row.id}: ${String(e)}`, "warn");
        }
      }

      // Folders — LWW per item, same per-row isolation.
      for (const row of result.folders) {
        try {
          await applyRemoteFolder(row);
        } catch (e) {
          flog(
            `[sync] applyRemoteFolder failed for ${row.id}: ${String(e)}`,
            "warn"
          );
        }
      }

      // Hard-purge local tombstones the server has also tombstoned.
      // The server purges tombstones >30d via cron (sub-épique 03 Task 7).
      // We mirror that on the client by deleting the local on-disk artifacts
      // for ids the server confirms are tombstoned. The Rust commands only
      // act on entries that ARE locally soft-deleted, so passing all
      // server-tombstoned ids regardless of age is safe and convergent.
      const tombstonedNoteIds = result.notes
        .filter((n) => n.deleted_at !== null)
        .map((n) => n.id);
      if (tombstonedNoteIds.length > 0) {
        try {
          await invoke<number>("purge_soft_deleted_notes_post_pull", {
            noteIds: tombstonedNoteIds,
          });
        } catch (e) {
          flog(
            `[sync] purge_soft_deleted_notes_post_pull failed: ${String(e)}`,
            "warn"
          );
        }
      }

      const tombstonedFolderIds = result.folders
        .filter((f) => f.deleted_at !== null)
        .map((f) => f.id);
      if (tombstonedFolderIds.length > 0) {
        try {
          await invoke<number>("purge_soft_deleted_folders_post_pull", {
            folderIds: tombstonedFolderIds,
          });
        } catch (e) {
          flog(
            `[sync] purge_soft_deleted_folders_post_pull failed: ${String(e)}`,
            "warn"
          );
        }
      }

      // Cursor for the next incremental pull MUST come from server `updated_at`
      // values, never the client wall-clock — a client clock ahead of the server
      // would push the cursor past rows written on another device and hide them
      // permanently. Display timestamps below stay wall-clock (cosmetic only).
      const nextCursor = computeNextPullCursor(since, result);
      await setMeta(KEY_LAST_PULL_AT, nextCursor);
      const nowIso = new Date().toISOString();
      setLastPullAt(nowIso);
      setLastSyncAt(nowIso);
      setStatus("idle");
      setLastError(null);
    } catch (e: unknown) {
      setStatus("error");
      setLastError(e instanceof Error ? e.message : String(e));
    }
  }, [enabled, auth.status, updateSettings]);

  /**
   * Push the COMPLETE local state of the active profile to the cloud:
   * profile + settings + dictionary + snippets + folders + notes. Idempotent
   * (all upserts), so it's safe to re-run — used both at activation and as a
   * recovery retry on mount / manual "sync now".
   *
   * ORDRE CRITIQUE — folders DOIVENT précéder notes dans le tableau d'ops.
   * Le sync-push Edge traite les ops séquentiellement (boucle for index), et
   * `user_notes.folder_id` a une FK vers `user_folders.id`. Sans cet ordre,
   * toute note avec folder_id non null déclenche une violation FK
   * (user_notes_folder_id_fkey).
   *
   * Returns true on full success (all ops accepted). On success it records
   * `initial_push_done` so mount stops retrying.
   */
  const fullPush = useCallback(async (): Promise<boolean> => {
    // Prevent a concurrent second full push (e.g. activation + mount retry
    // firing together). Idempotent upserts make a double push harmless, but
    // serializing avoids redundant work and interleaved status flips.
    if (pushingRef.current) return false;
    pushingRef.current = true;
    setStatus("syncing");
    try {
      const { id: cloudProfileId, name: cloudProfileName } =
        await ensureCloudProfileId(getMeta, setMeta);
      const deviceId = await getDeviceId();
      const ops: SyncOperation[] = [];
      ops.push({
        kind: "profile-upsert",
        profile: {
          id: cloudProfileId,
          name: cloudProfileName,
          updated_at: new Date().toISOString(),
          deleted_at: null,
        },
      });
      ops.push({
        kind: "settings-upsert",
        data: extractCloudSettings(settingsRef.current),
      });
      const d = await loadDictionary();
      for (const w of d.words) ops.push({ kind: "dictionary-upsert", word: w });
      const sn = await loadSnippets();
      for (const s of sn) {
        if (s.deleted_at) continue;
        ops.push({
          kind: "snippet-upsert",
          snippet: {
            id: s.id,
            label: s.label,
            content: s.content,
            shortcut: s.shortcut,
            updated_at: s.updated_at,
            deleted_at: null,
            created_at: s.created_at,
          },
        });
      }

      // Folders actifs — AVANT les notes (FK user_notes_folder_id_fkey).
      const folders = await listFolders();
      for (const f of folders) {
        if (f.deletedAt) continue;
        ops.push({ kind: "folder-upsert", folder: mapFolderToCloud(f) });
      }

      // Notes actives — après les folders. Lecture du contenu par note.
      // Une note > 1 MB (UTF-8) ne peut PAS être synchronisée : le serveur
      // valide le body du push de façon atomique, donc une seule note trop
      // grosse fait échouer TOUT le batch ("invalid body") et bloque
      // silencieusement toutes les autres ops. On les saute ici (elles
      // restent locales) et on les compte pour avertir l'utilisateur.
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

      let pushFailed: string | null = null;
      if (ops.length > 0) {
        // sync-push cap : max 200 ops par requête. Chunker en préservant
        // l'ordre global (le tableau `ops` est déjà folders-avant-notes,
        // donc chunker ne casse pas la garantie FK : tout folder est dans
        // un chunk antérieur ou identique à toute note qui le référence).
        const CHUNK = 200;
        let lastServerTime: string | undefined;
        for (let i = 0; i < ops.length; i += CHUNK) {
          const chunk = ops.slice(i, i + CHUNK);
          const resp = await pushOperations(chunk, deviceId, cloudProfileId);
          if (!resp.ok) {
            pushFailed = resp.error ?? "unknown";
            flog(
              `[sync] full push chunk ${Math.floor(i / CHUNK)} failed: ${pushFailed}`,
              "warn"
            );
            break;
          }
          // A 200 response can still carry per-op failures (FK, RLS, …). Surface
          // them instead of reporting a clean sync the DB never received.
          const firstFailed = resp.results.find((r) => !r.ok);
          if (firstFailed) {
            pushFailed = firstFailed.error ?? "operation rejected";
            flog(
              `[sync] full push op ${firstFailed.index} rejected: ${pushFailed}`,
              "warn"
            );
            break;
          }
          if (resp.server_time) lastServerTime = resp.server_time;
        }
        if (lastServerTime) {
          await setMeta(KEY_LAST_PUSHED_SETTINGS_AT, lastServerTime);
        }
      }
      if (pushFailed) {
        setStatus("error");
        setLastError(pushFailed);
        return false;
      }
      await setMeta(KEY_INITIAL_PUSH_DONE, true);
      setStatus("idle");
      setLastError(null);
      setLastSyncAt(new Date().toISOString());
      return true;
    } catch (e) {
      flog(`[sync] full push failed: ${String(e)}`, "warn");
      setStatus("error");
      setLastError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      pushingRef.current = false;
    }
  }, [getDeviceId]);

  const enableSync = useCallback(async () => {
    await setMeta(KEY_ENABLED, true);
    // A fresh activation must run (or re-run) the initial full push.
    await setMeta(KEY_INITIAL_PUSH_DONE, false);
    setEnabled(true);
    setSyncActive(true);
    setStatus("idle");

    // Generate/persist the cloud_profile_id BEFORE the pull — pullAndApply
    // early-returns when the active profile has no cloud partition yet, so the
    // forceFull reconcile would be a no-op otherwise. fullPush re-ensures it
    // (idempotent: returns the same stored id).
    await ensureCloudProfileId(getMeta, setMeta);

    // Legacy migration : importer settings.snippets / settings.dictionary si présents
    try {
      const current = settingsRef.current;
      await migrateLegacySnippetsOnce(current.snippets ?? []);
      await migrateLegacyDictionaryOnce(current.dictionary ?? []);
    } catch (e) {
      flog(`[sync] legacy migration failed: ${String(e)}`, "warn");
    }

    await pullAndApply({ forceFull: true });
    await fullPush();
  }, [pullAndApply, fullPush]);

  const disableSync = useCallback(async () => {
    // Task 19 : flush les notes en cours de debounce (push immédiat) avant de
    // désactiver, sinon les modifs des 2 dernières secondes sont perdues si
    // l'user se déconnecte juste après avoir tapé.
    try {
      await flushPendingNoteUpdates();
    } catch (e) {
      flog(`[sync] flushPendingNoteUpdates failed on disable: ${String(e)}`, "warn");
    }
    await setMeta(KEY_ENABLED, false);
    // Clear the incremental cursor so a later re-enable always full-reconciles
    // (re-activation must never resume an incremental pull from a stale cursor).
    await setMeta(KEY_LAST_PULL_AT, null);
    // Force the next activation to redo the initial full push.
    await setMeta(KEY_INITIAL_PUSH_DONE, false);
    setLastPullAt(null);
    setEnabled(false);
    setSyncActive(false);
    setStatus("disabled");
  }, []);

  const syncNow = useCallback(async () => {
    if (!enabled) return;
    await flushQueue();
    // A manual "sync now" also re-asserts the full local state. This is the
    // recovery path when the initial push failed (e.g. an oversized note that
    // has since been trimmed): one click re-pushes everything, idempotently.
    await fullPush();
    await pullAndApply();
  }, [enabled, flushQueue, fullPush, pullAndApply]);

  const notifySettingsChanged = useCallback(
    (previous: AppSettings["settings"], current: AppSettings["settings"]) => {
      if (!enabled) return;
      if (!syncableSettingsChanged(previous, current)) return;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        void enqueueAndTry({
          kind: "settings-upsert",
          data: extractCloudSettings(current),
        });
      }, DEBOUNCE_PUSH_MS);
    },
    [enabled, enqueueAndTry]
  );

  const notifyDictionaryUpserted = useCallback(
    (word: string) => {
      void enqueueAndTry({ kind: "dictionary-upsert", word });
    },
    [enqueueAndTry]
  );

  const notifyDictionaryDeleted = useCallback(
    (word: string) => {
      void enqueueAndTry({ kind: "dictionary-delete", word });
    },
    [enqueueAndTry]
  );

  const notifySnippetUpserted = useCallback(
    (id: string, label: string, content: string, shortcut: string | null) => {
      void enqueueAndTry({
        kind: "snippet-upsert",
        snippet: {
          id,
          label,
          content,
          shortcut,
          updated_at: new Date().toISOString(),
          deleted_at: null,
          created_at: new Date().toISOString(),
        },
      });
    },
    [enqueueAndTry]
  );

  const notifySnippetDeleted = useCallback(
    (id: string) => {
      void enqueueAndTry({ kind: "snippet-delete", id });
    },
    [enqueueAndTry]
  );

  // Lifecycle : login → pullAndApply + flush, then finish any initial push that
  // never completed (offline last time, transient error, oversized note now
  // trimmed). The flag makes the push a no-op once the first full push
  // succeeded. Guarded to run ONCE per signed-in session — without the ref it
  // would re-fire on every render where `pullAndApply`/`fullPush` change
  // identity, re-pulling and re-pushing needlessly.
  const mountSyncRanRef = useRef(false);
  useEffect(() => {
    if (!enabled || auth.status !== "signed-in") {
      mountSyncRanRef.current = false;
      return;
    }
    if (mountSyncRanRef.current) return;
    mountSyncRanRef.current = true;
    void (async () => {
      await pullAndApply();
      await flushQueue();
      const done = await getMeta<boolean>(KEY_INITIAL_PUSH_DONE, false);
      if (!done) await fullPush();
    })();
  }, [auth.status, enabled, pullAndApply, flushQueue, fullPush]);

  // Recompute the oversized-note count once per session when sync is on, so the
  // "too large to sync" warning survives an app restart (enableSync only runs at
  // activation time). Best-effort: failures leave the count at 0.
  useEffect(() => {
    if (!enabled) return;
    if (auth.status !== "signed-in") return;
    void scanOversizedNoteCount()
      .then(setOversizedNoteCount)
      .catch(() => {});
  }, [auth.status, enabled]);

  // Schedule a retry when the head's next_retry_at is past
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(async () => {
      if (flushingRef.current) return;
      const ready = await peekReadyHead();
      if (ready) void flushQueue();
    }, 5_000);
    return () => clearInterval(id);
  }, [enabled, flushQueue]);

  // Subscribe to settings changes when sync is on so edits anywhere in the UI
  // hit `notifySettingsChanged` and trigger the debounced push.
  useEffect(() => {
    if (!enabled) return;
    const unsub = subscribeToChanges((prev, next) => {
      notifySettingsChanged(prev, next);
    });
    return unsub;
  }, [enabled, subscribeToChanges, notifySettingsChanged]);

  // Lifecycle : focus window après idle ≥ 5 min → incremental pull
  useEffect(() => {
    if (!enabled) return;
    const win = getCurrentWindow();
    let idleSince = Date.now();
    let focusUnlisten: (() => void) | undefined;

    (async () => {
      focusUnlisten = await win.onFocusChanged(({ payload: focused }) => {
        if (focused) {
          const idle = Date.now() - idleSince;
          if (idle >= FOCUS_PULL_IDLE_MS) {
            void pullAndApply();
          }
        } else {
          idleSince = Date.now();
        }
      });
    })();

    return () => {
      focusUnlisten?.();
    };
  }, [enabled, pullAndApply]);

  // Logout → disable (clears sync state but keeps local data)
  useEffect(() => {
    if (auth.status === "signed-out" && enabled) {
      void disableSync();
    }
  }, [auth.status, enabled, disableSync]);

  const value = useMemo<SyncContextValue>(
    () => ({
      enabled,
      status,
      last_sync_at: lastSyncAt,
      last_pull_at: lastPullAt,
      pending_count: pendingCount,
      dead_letter_count: deadLetterCount,
      oversized_note_count: oversizedNoteCount,
      last_error: lastError,
      enableSync,
      disableSync,
      syncNow,
      refreshDeadLetters: refreshDeadLetterCount,
      notifySettingsChanged,
      notifyDictionaryUpserted,
      notifyDictionaryDeleted,
      notifySnippetUpserted,
      notifySnippetDeleted,
    }),
    [
      enabled,
      status,
      lastSyncAt,
      lastPullAt,
      pendingCount,
      deadLetterCount,
      oversizedNoteCount,
      lastError,
      enableSync,
      disableSync,
      syncNow,
      refreshDeadLetterCount,
      notifySettingsChanged,
      notifyDictionaryUpserted,
      notifyDictionaryDeleted,
      notifySnippetUpserted,
      notifySnippetDeleted,
    ]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
