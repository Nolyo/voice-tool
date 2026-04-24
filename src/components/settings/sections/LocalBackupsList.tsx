import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  listLocalBackups,
  restoreLocalBackup,
  deleteLocalBackup,
  type BackupMeta,
} from "@/lib/sync/backups";

export function LocalBackupsList() {
  const { t } = useTranslation();
  const [list, setList] = useState<BackupMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setList(await listLocalBackups());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onRestore = async (filename: string) => {
    if (!confirm(t("sync.backups.confirm_restore"))) return;
    setBusy(true);
    setMsg(null);
    try {
      const result = await restoreLocalBackup(filename);
      if (result.failed.length === 0) {
        setMsg(t("sync.backups.restore_ok"));
      } else {
        setMsg(
          t("sync.backups.restore_partial", {
            failed: result.failed.map((f) => f.file).join(", "),
          }),
        );
      }
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (filename: string) => {
    if (!confirm(t("sync.backups.confirm_delete"))) return;
    setBusy(true);
    try {
      await deleteLocalBackup(filename);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">{t("sync.backups.title")}</h4>
      {list.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {t("sync.backups.empty")}
        </p>
      )}
      {list.length > 0 && (
        <ul className="space-y-1">
          {list.map((b) => (
            <li
              key={b.filename}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono">{b.filename}</div>
                <div className="text-muted-foreground">
                  {new Date(b.created_at).toLocaleString()} ·{" "}
                  {(b.size_bytes / 1024).toFixed(1)} KB
                </div>
              </div>
              <div className="ml-3 flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRestore(b.filename)}
                  className="rounded px-2 py-1 hover:bg-muted disabled:opacity-50"
                >
                  {t("sync.backups.restore")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDelete(b.filename)}
                  className="rounded px-2 py-1 text-destructive hover:bg-muted disabled:opacity-50"
                >
                  {t("common.delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
