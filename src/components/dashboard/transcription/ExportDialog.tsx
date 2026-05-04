"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Check, FolderOpen, Loader2, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Transcription } from "@/hooks/useTranscriptionHistory";
import {
  exportTranscriptions,
  type ExportFormat,
} from "@/lib/transcription-export";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Items currently shown in the list (after search + filters). */
  filteredItems: Transcription[];
  /** All items in history (unfiltered). */
  allItems: Transcription[];
}

type Scope = "filtered" | "all";

const FORMATS: {
  id: ExportFormat;
  labelKey: string;
  hintKey: string;
}[] = [
  { id: "txt", labelKey: "history.export.formatTxt", hintKey: "history.export.formatTxtHint" },
  { id: "md", labelKey: "history.export.formatMd", hintKey: "history.export.formatMdHint" },
  { id: "json", labelKey: "history.export.formatJson", hintKey: "history.export.formatJsonHint" },
  { id: "csv", labelKey: "history.export.formatCsv", hintKey: "history.export.formatCsvHint" },
];

export function ExportDialog({
  open,
  onOpenChange,
  filteredItems,
  allItems,
}: ExportDialogProps) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<ExportFormat>("md");
  const [scope, setScope] = useState<Scope>("filtered");
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [includeOriginal, setIncludeOriginal] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ path: string; filename: string } | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setError(null);
      setDone(null);
      setBusy(false);
      // Default scope: "filtered" if it differs from "all", else "all".
      setScope(filteredItems.length !== allItems.length ? "filtered" : "all");
    }
  }, [open, filteredItems.length, allItems.length]);

  const items = scope === "filtered" ? filteredItems : allItems;
  const filteredEqualsAll = filteredItems.length === allItems.length;

  const stats = useMemo(() => {
    const totalWords = items.reduce(
      (a, t) => a + (t.text.trim() ? t.text.trim().split(/\s+/).length : 0),
      0,
    );
    const totalDuration = items.reduce((a, t) => a + (t.duration ?? 0), 0);
    return { totalWords, totalDuration };
  }, [items]);

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await exportTranscriptions(items, {
        format,
        includeMetadata,
        includeOriginal,
      });
      setDone(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleReveal = async () => {
    if (!done) return;
    try {
      const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
      await revealItemInDir(done.path);
    } catch (err) {
      console.error("Failed to reveal export:", err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="vt-app sm:max-w-[520px] border-0 bg-transparent p-0 shadow-none">
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "var(--vt-bg)",
            border: "1px solid var(--vt-border)",
            boxShadow: "var(--vt-shadow-elevated)",
          }}
        >
          <div className="px-6 pt-6 pb-2">
            <DialogHeader>
              <DialogTitle
                className="vt-display text-[16px] font-semibold"
                style={{ color: "var(--vt-fg)" }}
              >
                {t("history.export.title")}
              </DialogTitle>
              <DialogDescription
                className="text-[12.5px]"
                style={{ color: "var(--vt-fg-3)" }}
              >
                {t("history.export.description")}
              </DialogDescription>
            </DialogHeader>
          </div>

          {done ? (
            <div className="px-6 pb-6 pt-2">
              <div
                className="rounded-xl p-4 flex items-start gap-3"
                style={{
                  background: "oklch(from var(--vt-ok) l c h / 0.1)",
                  border: "1px solid oklch(from var(--vt-ok) l c h / 0.3)",
                }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--vt-ok)", color: "white" }}
                >
                  <Check className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[13.5px] font-medium"
                    style={{ color: "var(--vt-fg)" }}
                  >
                    {t("history.export.success")}
                  </div>
                  <div
                    className="text-[11.5px] vt-mono mt-0.5 truncate"
                    style={{ color: "var(--vt-fg-3)" }}
                    title={done.path}
                  >
                    {done.filename}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={handleReveal}
                  className="vt-btn vt-btn-sm"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  {t("history.export.reveal")}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="vt-btn vt-btn-sm vt-btn-primary"
                >
                  {t("common.close")}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="px-6 pb-4 pt-2 space-y-5">
                {/* Format selector */}
                <div>
                  <div
                    className="text-[11.5px] font-medium uppercase tracking-wide mb-2"
                    style={{ color: "var(--vt-fg-3)" }}
                  >
                    {t("history.export.formatLabel")}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {FORMATS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFormat(f.id)}
                        className="vt-format-tile"
                        data-on={format === f.id}
                      >
                        <div
                          className="vt-mono text-[10.5px] uppercase font-semibold"
                          style={{
                            color: format === f.id ? "var(--vt-accent)" : "var(--vt-fg-3)",
                          }}
                        >
                          .{f.id}
                        </div>
                        <div
                          className="text-[12.5px] font-medium mt-0.5"
                          style={{ color: "var(--vt-fg)" }}
                        >
                          {t(f.labelKey)}
                        </div>
                        <div
                          className="text-[11px] mt-0.5"
                          style={{ color: "var(--vt-fg-3)" }}
                        >
                          {t(f.hintKey)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Scope selector */}
                <div>
                  <div
                    className="text-[11.5px] font-medium uppercase tracking-wide mb-2"
                    style={{ color: "var(--vt-fg-3)" }}
                  >
                    {t("history.export.scopeLabel")}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label
                      className="vt-radio-row"
                      data-on={scope === "filtered"}
                      data-disabled={filteredEqualsAll}
                    >
                      <input
                        type="radio"
                        name="scope"
                        checked={scope === "filtered"}
                        onChange={() => setScope("filtered")}
                        disabled={filteredEqualsAll}
                      />
                      <span style={{ color: "var(--vt-fg)" }}>
                        {t("history.export.scopeFiltered", {
                          count: filteredItems.length,
                        })}
                      </span>
                    </label>
                    <label className="vt-radio-row" data-on={scope === "all"}>
                      <input
                        type="radio"
                        name="scope"
                        checked={scope === "all"}
                        onChange={() => setScope("all")}
                      />
                      <span style={{ color: "var(--vt-fg)" }}>
                        {t("history.export.scopeAll", {
                          count: allItems.length,
                        })}
                      </span>
                    </label>
                  </div>
                </div>

                {/* Options */}
                <div className="space-y-1.5">
                  <label className="vt-checkbox-row">
                    <input
                      type="checkbox"
                      checked={includeMetadata}
                      onChange={(e) => setIncludeMetadata(e.target.checked)}
                    />
                    <span style={{ color: "var(--vt-fg)" }}>
                      {t("history.export.includeMetadata")}
                    </span>
                  </label>
                  <label className="vt-checkbox-row">
                    <input
                      type="checkbox"
                      checked={includeOriginal}
                      onChange={(e) => setIncludeOriginal(e.target.checked)}
                    />
                    <span style={{ color: "var(--vt-fg)" }}>
                      {t("history.export.includeOriginal")}
                    </span>
                  </label>
                </div>

                {/* Summary */}
                <div
                  className="rounded-lg px-3 py-2 text-[11.5px]"
                  style={{
                    background: "var(--vt-hover)",
                    color: "var(--vt-fg-3)",
                  }}
                >
                  <span className="vt-mono">{items.length}</span>{" "}
                  {t("history.export.summaryItems")}
                  {stats.totalWords > 0 && (
                    <>
                      {" · "}
                      <span className="vt-mono">{stats.totalWords}</span>{" "}
                      {t("history.export.summaryWords")}
                    </>
                  )}
                  {stats.totalDuration > 0 && (
                    <>
                      {" · "}
                      <span className="vt-mono">
                        {Math.round(stats.totalDuration / 60)}m
                      </span>{" "}
                      {t("history.export.summaryAudio")}
                    </>
                  )}
                </div>

                {error && (
                  <div
                    className="rounded-lg px-3 py-2 flex items-start gap-2 text-[12px]"
                    style={{
                      background: "oklch(from var(--vt-danger) l c h / 0.1)",
                      border: "1px solid oklch(from var(--vt-danger) l c h / 0.3)",
                      color: "var(--vt-danger)",
                    }}
                  >
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              <div
                className="px-6 py-4 flex justify-end gap-2"
                style={{ borderTop: "1px solid var(--vt-border)" }}
              >
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="vt-btn vt-btn-sm"
                  disabled={busy}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleExport}
                  className="vt-btn vt-btn-sm vt-btn-primary"
                  disabled={busy || items.length === 0}
                >
                  {busy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  {t("history.export.confirmCta")}
                </button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
