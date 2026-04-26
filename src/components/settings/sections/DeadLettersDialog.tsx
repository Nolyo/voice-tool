import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  enqueue,
  getDeadLetters,
  removeDeadLetter,
} from "@/lib/sync/queue";
import { useSync } from "@/hooks/useSync";
import type { SyncQueueEntry } from "@/lib/sync/types";

interface DeadLettersDialogProps {
  open: boolean;
  onClose: () => void;
}

export function DeadLettersDialog({ open, onClose }: DeadLettersDialogProps) {
  const { t } = useTranslation();
  const { refreshDeadLetters } = useSync();
  const [items, setItems] = useState<SyncQueueEntry[]>([]);

  useEffect(() => {
    if (!open) return;
    void getDeadLetters().then(setItems);
  }, [open]);

  async function handleRetry(entry: SyncQueueEntry) {
    await enqueue(entry.operation);
    await removeDeadLetter(entry.id);
    setItems((prev) => prev.filter((e) => e.id !== entry.id));
    await refreshDeadLetters();
  }

  async function handleDiscard(id: string) {
    await removeDeadLetter(id);
    setItems((prev) => prev.filter((e) => e.id !== id));
    await refreshDeadLetters();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("sync.deadLetters.title")}</DialogTitle>
          <DialogDescription>
            {t("sync.deadLetters.subtitle", { count: items.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto space-y-3">
          {items.length === 0 && (
            <div className="text-sm text-muted-foreground py-6 text-center">
              {t("sync.deadLetters.empty")}
            </div>
          )}
          {items.map((entry) => (
            <div
              key={entry.id}
              className="rounded-md border p-3 text-xs space-y-2"
            >
              <pre className="vt-mono whitespace-pre-wrap break-words text-[11px]">
                {JSON.stringify(entry.operation, null, 2)}
              </pre>
              {entry.last_error && (
                <div className="text-[11px] text-destructive">
                  <strong>{t("sync.deadLetters.lastError")}:</strong>{" "}
                  {entry.last_error}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleRetry(entry)}
                >
                  {t("sync.deadLetters.retry")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleDiscard(entry.id)}
                >
                  {t("sync.deadLetters.discard")}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
