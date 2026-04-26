import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { loadSnippets } from "@/lib/sync/snippets-store";
import { loadDictionary } from "@/lib/sync/dictionary-store";
import { createLocalBackup } from "@/lib/sync/backups";
import { useSync } from "@/hooks/useSync";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SyncActivationModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const sync = useSync();
  const [nonTrivial, setNonTrivial] = useState<boolean | null>(null);
  const [choice, setChoice] = useState<"upload" | "fresh">("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const sn = (await loadSnippets()).filter((s) => s.deleted_at === null);
      const d = await loadDictionary();
      if (cancelled) return;
      const nonTriv = sn.length > 0 || d.words.length >= 3;
      setNonTrivial(nonTriv);
      if (!nonTriv) setChoice("upload");
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Reset transient state when modal closes.
  useEffect(() => {
    if (!open) {
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const handleActivate = async () => {
    setBusy(true);
    setError(null);
    try {
      await createLocalBackup();
      // NB: choosing "fresh" doesn't wipe local here — the pull right after enableSync()
      // brings down the existing cloud state which overrides scalars via LWW and merges
      // collections by UUID/composite key. The backup we just took is the safety net.
      await sync.enableSync();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="vt-app sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("sync.activation.title")}</DialogTitle>
        </DialogHeader>

        {nonTrivial === null && (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        )}

        {nonTrivial === false && (
          <p className="text-sm text-muted-foreground">
            {t("sync.activation.no_local_data")}
          </p>
        )}

        {nonTrivial === true && (
          <div className="space-y-3">
            <p className="text-sm">{t("sync.activation.has_local_data")}</p>

            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/50">
              <input
                type="radio"
                name="sync-choice"
                value="upload"
                checked={choice === "upload"}
                onChange={() => setChoice("upload")}
                className="mt-1"
              />
              <div className="space-y-1">
                <div className="text-sm font-medium">
                  {t("sync.activation.choice_upload")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("sync.activation.choice_upload_desc")}
                </div>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/50">
              <input
                type="radio"
                name="sync-choice"
                value="fresh"
                checked={choice === "fresh"}
                onChange={() => setChoice("fresh")}
                className="mt-1"
              />
              <div className="space-y-1">
                <div className="text-sm font-medium">
                  {t("sync.activation.choice_fresh")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("sync.activation.choice_fresh_desc")}
                </div>
              </div>
            </label>
          </div>
        )}

        <div className="space-y-2">
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            {t("sync.activation.api_keys_notice")}
          </div>
          <div className="rounded-md border border-blue-500/40 bg-blue-500/10 p-3 text-xs">
            {t("sync.activation.backup_notice")}
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleActivate}
            disabled={busy || nonTrivial === null}
          >
            {busy
              ? t("sync.activation.activating")
              : t("sync.activation.activate")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
