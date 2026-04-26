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
import { extractCloudSettings, syncableSettingsChanged } from "@/lib/sync/mapping";
import { pullAll, pushOperations } from "@/lib/sync/client";
import {
  enqueue,
  peekAll,
  markRetry,
  size as queueSize,
} from "@/lib/sync/queue";
import { applyBatchResults } from "@/lib/sync/apply-batch-results";
import {
  loadSnippets,
  applyRemoteSnippet,
  migrateLegacySnippetsOnce,
} from "@/lib/sync/snippets-store";
import {
  loadDictionary,
  applyRemoteWord,
  migrateLegacyDictionaryOnce,
} from "@/lib/sync/dictionary-store";
import { mergeSettingsLWW } from "@/lib/sync/merge";
import type { AppSettings } from "@/lib/settings";
import type { SyncOperation, SyncState, SyncStatus } from "@/lib/sync/types";

const SYNC_META_STORE = "sync-meta.json";
const KEY_ENABLED = "enabled";
const KEY_LAST_PULL_AT = "last_pull_at";
const KEY_LAST_PUSHED_SETTINGS_AT = "last_pushed_settings_at";
const DEBOUNCE_PUSH_MS = 500;
const FOCUS_PULL_IDLE_MS = 5 * 60 * 1000;

export interface SyncContextValue extends SyncState {
  enableSync(): Promise<void>;
  disableSync(): Promise<void>;
  syncNow(): Promise<void>;
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

async function getMeta<T>(key: string, def: T): Promise<T> {
  const store = await Store.load(SYNC_META_STORE);
  const v = await store.get<T>(key);
  return v ?? def;
}
async function setMeta(key: string, value: unknown): Promise<void> {
  const store = await Store.load(SYNC_META_STORE);
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
  const [lastError, setLastError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const flushingRef = useRef(false);
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
      setLastPullAt(lp);
      setPendingCount(await queueSize());
      setStatus(en ? "idle" : "disabled");
    })();
  }, []);

  const getDeviceId = useCallback(async (): Promise<string> => {
    return invoke<string>("get_or_create_device_id");
  }, []);

  const flushQueue = useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    setStatus("syncing");
    try {
      const deviceId = await getDeviceId();
      let sawError = false;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const pending = await peekAll();
        if (pending.length === 0) break;
        const batch = pending.slice(0, 50);
        const ops = batch.map((e) => e.operation);
        const resp = await pushOperations(ops, deviceId);
        if (!resp.ok) {
          const head = pending[0];
          await markRetry(head.id, resp.error ?? "push failed");
          setStatus("offline");
          setLastError(resp.error ?? "push failed");
          sawError = true;
          break;
        }
        const { failedCount } = await applyBatchResults(batch, resp.results);
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
      if (!sawError) {
        setStatus("idle");
        setLastError(null);
      }
    } finally {
      flushingRef.current = false;
    }
  }, [getDeviceId]);

  const enqueueAndTry = useCallback(
    async (op: SyncOperation) => {
      if (!enabled) return;
      await enqueue(op);
      setPendingCount(await queueSize());
      void flushQueue();
    },
    [enabled, flushQueue]
  );

  const pullAndApply = useCallback(async () => {
    if (!enabled || auth.status !== "signed-in") return;
    setStatus("syncing");
    try {
      const since = await getMeta<string | null>(KEY_LAST_PULL_AT, null);
      const result = await pullAll(since);

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
        if (merged.action === "apply-cloud") {
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

      const nowIso = new Date().toISOString();
      await setMeta(KEY_LAST_PULL_AT, nowIso);
      setLastPullAt(nowIso);
      setLastSyncAt(nowIso);
      setStatus("idle");
      setLastError(null);
    } catch (e: unknown) {
      setStatus("error");
      setLastError(e instanceof Error ? e.message : String(e));
    }
  }, [enabled, auth.status, updateSettings]);

  const enableSync = useCallback(async () => {
    await setMeta(KEY_ENABLED, true);
    setEnabled(true);
    setStatus("idle");

    // Legacy migration : importer settings.snippets / settings.dictionary si présents
    try {
      const current = settingsRef.current;
      await migrateLegacySnippetsOnce(current.snippets ?? []);
      await migrateLegacyDictionaryOnce(current.dictionary ?? []);
    } catch (e) {
      console.warn("[sync] legacy migration failed", e);
    }

    await pullAndApply();

    // Full push initial : settings + dico + snippets
    try {
      const deviceId = await getDeviceId();
      const ops: SyncOperation[] = [];
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
      if (ops.length > 0) {
        const resp = await pushOperations(ops, deviceId);
        if (resp.server_time) await setMeta(KEY_LAST_PUSHED_SETTINGS_AT, resp.server_time);
      }
    } catch (e) {
      console.warn("[sync] initial full push failed", e);
    }
  }, [pullAndApply, getDeviceId]);

  const disableSync = useCallback(async () => {
    await setMeta(KEY_ENABLED, false);
    setEnabled(false);
    setStatus("disabled");
  }, []);

  const syncNow = useCallback(async () => {
    if (!enabled) return;
    await flushQueue();
    await pullAndApply();
  }, [enabled, flushQueue, pullAndApply]);

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

  // Lifecycle : login → pullAndApply + flush
  useEffect(() => {
    if (!enabled) return;
    if (auth.status !== "signed-in") return;
    void pullAndApply().then(() => flushQueue());
  }, [auth.status, enabled, pullAndApply, flushQueue]);

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
      last_error: lastError,
      enableSync,
      disableSync,
      syncNow,
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
      lastError,
      enableSync,
      disableSync,
      syncNow,
      notifySettingsChanged,
      notifyDictionaryUpserted,
      notifyDictionaryDeleted,
      notifySnippetUpserted,
      notifySnippetDeleted,
    ]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
