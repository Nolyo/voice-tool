import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Share2 } from "lucide-react";
import type { NoteMeta } from "@/hooks/useNotes";
import { useSync } from "@/hooks/useSync";
import { useNoteShares } from "@/hooks/useNoteShares";
import { shareUrl } from "@/lib/sharing/slug";

export function ShareNoteButton({ note }: { note: NoteMeta | null }) {
  const { t } = useTranslation();
  const { enabled } = useSync();
  const { activeShareFor, share, revoke } = useNoteShares();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Ref for the copy-feedback timeout — cleared on unmount to prevent
  // state-update-after-unmount warnings.
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ref for the container element — used for outside-click detection.
  const containerRef = useRef<HTMLDivElement>(null);

  // Clear pending copy timer on unmount.
  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // Close the popover when the user clicks outside the container.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!note) return null;
  const active = activeShareFor(note.id);

  const onCreate = async () => {
    setBusy(true);
    try { await share(note.id, note.title); } finally { setBusy(false); }
  };
  const onCopy = async () => {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(shareUrl(active.slug));
      setCopied(true);
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard write failed (e.g. permission denied) — silently ignore.
    }
  };
  const onStop = async () => {
    if (!active) return;
    setBusy(true);
    try { await revoke(active.id); } finally { setBusy(false); }
  };

  return (
    <div className="note-share" ref={containerRef}>
      <button
        type="button"
        className="note-meta-item note-share-trigger"
        aria-label={t("notes.share.button", { defaultValue: "Partager" })}
        onClick={() => setOpen((v) => !v)}
      >
        <Share2 className="w-3 h-3" />
        <span>{t("notes.share.button", { defaultValue: "Partager" })}</span>
      </button>

      {open && (
        <div className="note-share-popover" role="dialog">
          <p className="note-share-title">{t("notes.share.title", { defaultValue: "Partager ce tuto" })}</p>

          {!enabled && (
            <p className="note-share-warn">
              {t("notes.share.syncRequired", { defaultValue: "Active la synchronisation pour partager une note." })}
            </p>
          )}

          {enabled && !active && (
            <button type="button" className="note-share-action" disabled={busy} onClick={onCreate}>
              {busy
                ? t("notes.share.creating", { defaultValue: "Création…" })
                : t("notes.share.create", { defaultValue: "Créer un lien public" })}
            </button>
          )}

          {enabled && active && (
            <div className="note-share-active">
              <input className="note-share-url" readOnly value={shareUrl(active.slug)} />
              <p className="note-share-hint">
                {t("notes.share.liveHint", { defaultValue: "Le lien montre toujours la dernière version synchronisée." })}
              </p>
              <div className="note-share-buttons">
                <button type="button" onClick={onCopy}>
                  {copied
                    ? t("notes.share.copied", { defaultValue: "Lien copié" })
                    : t("notes.share.copy", { defaultValue: "Copier le lien" })}
                </button>
                <button type="button" className="note-share-stop" disabled={busy} onClick={onStop}>
                  {t("notes.share.stop", { defaultValue: "Arrêter le partage" })}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
