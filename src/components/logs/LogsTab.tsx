"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Copy,
  Download,
  FolderOpen,
  Info,
  Pause,
  Play,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { AppLog } from "@/hooks/useAppLogs";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";

interface LogsTabProps {
  logs: AppLog[];
  onClearLogs: () => void;
  levelFilter: LevelFilter;
  sourceFilter: string | null;
  onSourceFilterChange: (next: string | null) => void;
}

export type LogLevel = AppLog["level"];
export type LevelFilter = Record<LogLevel, boolean>;

export const ALL_LEVELS_ON: LevelFilter = {
  error: true,
  warn: true,
  info: true,
  debug: true,
  trace: true,
};

/** Internal sentinel for logs missing a source (legacy entries or trace paths).
 *  Render sites must convert to a localized label via `t("logs.unknownSource")`. */
export const UNKNOWN_SOURCE = "__unknown__";

export function sourceOf(log: AppLog): string {
  return log.source?.trim() ? log.source : UNKNOWN_SOURCE;
}

/** Stable hue per source string (djb2 hash → 360°). Unknown sources use a
 * neutral muted gray so they recede visually. */
export function sourceColor(name: string): string {
  if (name === UNKNOWN_SOURCE) return "var(--vt-fg-4)";
  let hash = 5381;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) + hash + name.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `oklch(0.72 0.14 ${hue})`;
}

function parseLogDate(ts: string): Date {
  // Backend format: "YYYY-MM-DD HH:mm:ss.SSS" (Rust chrono). Also tolerate ISO.
  const iso = ts.includes("T") ? ts : ts.replace(" ", "T");
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) return d;
  return new Date(ts);
}

function fmtTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

/* ── Timeline density strip ─────────────────────────────────────── */
function TimelineStrip({ logs }: { logs: AppLog[] }) {
  const bins = useMemo(() => {
    if (logs.length === 0) return [];
    const dates = logs.map((l) => parseLogDate(l.timestamp).getTime());
    const min = Math.min(...dates);
    const max = Math.max(...dates);
    const span = Math.max(1, max - min);
    const B = 40;
    const buckets = Array.from({ length: B }, () => ({
      error: 0,
      warn: 0,
      info: 0,
      debug: 0,
      trace: 0,
      total: 0,
    }));
    for (let i = 0; i < logs.length; i++) {
      const idx = Math.min(B - 1, Math.floor(((dates[i] - min) / span) * B));
      buckets[idx][logs[i].level]++;
      buckets[idx].total++;
    }
    return buckets;
  }, [logs]);

  const peak = Math.max(1, ...bins.map((b) => b.total));
  const first = logs.length > 0 ? fmtTime(parseLogDate(logs[logs.length - 1].timestamp)).slice(0, 8) : "--:--:--";
  const last = logs.length > 0 ? fmtTime(parseLogDate(logs[0].timestamp)).slice(0, 8) : "--:--:--";

  return (
    <div
      className="flex items-center gap-3 px-6 py-3"
      style={{
        borderBottom: "1px solid var(--vt-border)",
        background: "oklch(from var(--vt-panel) calc(l - 0.005) c h)",
      }}
    >
      <div className="flex-1 mini-bar" style={{ height: 40 }}>
        {bins.map((b, i) => {
          const H = 38;
          const h = Math.max(2, (b.total / peak) * H);
          const segs: { c: string; n: number }[] = [
            { c: "var(--vt-danger)", n: b.error },
            { c: "var(--vt-warn)", n: b.warn },
            { c: "var(--vt-info)", n: b.info },
            { c: "var(--vt-trace)", n: b.trace },
            { c: "var(--vt-debug)", n: b.debug },
          ];
          return (
            <div
              key={i}
              className="flex-1 flex flex-col justify-end"
              style={{ height: H }}
            >
              <div
                style={{
                  height: h,
                  display: "flex",
                  flexDirection: "column-reverse",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                {segs.map(
                  (s, j) =>
                    s.n > 0 && (
                      <div
                        key={j}
                        style={{ flex: s.n, background: s.c, minHeight: 1 }}
                      />
                    ),
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div
        className="flex flex-col text-right text-[10px] vt-mono"
        style={{ color: "var(--vt-fg-4)" }}
      >
        <span>{first}</span>
        <span>·</span>
        <span>{last}</span>
      </div>
    </div>
  );
}

/* ── LogRowCopyButton (per-row scoped) ──────────────────────────── */
function LogRowCopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const { copy, justCopied } = useCopyToClipboard();
  return (
    <button
      type="button"
      className="log-row-copy"
      onClick={() => {
        void copy(text);
      }}
      title={justCopied ? t("common.copied") : t("logs.copyLine")}
      aria-label={justCopied ? t("common.copied") : t("logs.copyLine")}
    >
      {justCopied ? (
        <Check className="w-3 h-3" style={{ color: "var(--vt-ok)" }} />
      ) : (
        <Copy className="w-3 h-3" />
      )}
    </button>
  );
}

/* ── Main LogsTab ──────────────────────────────────────────────── */
export function LogsTab({
  logs,
  onClearLogs,
  levelFilter,
  sourceFilter,
  onSourceFilterChange,
}: LogsTabProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const [snapshot, setSnapshot] = useState<AppLog[] | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTimeline, setShowTimeline] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Freeze the log feed while paused
  useEffect(() => {
    if (paused) {
      setSnapshot((cur) => cur ?? logs);
    } else {
      setSnapshot(null);
    }
  }, [paused, logs]);

  const effectiveLogs = paused ? (snapshot ?? logs) : logs;

  const counts = useMemo(() => {
    const c: Record<LogLevel, number> = {
      error: 0,
      warn: 0,
      info: 0,
      debug: 0,
      trace: 0,
    };
    for (const l of effectiveLogs) c[l.level]++;
    return c;
  }, [effectiveLogs]);

  const filtered = useMemo(() => {
    return effectiveLogs.filter((l) => {
      if (!levelFilter[l.level]) return false;
      if (sourceFilter && sourceOf(l) !== sourceFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          l.message.toLowerCase().includes(q) ||
          sourceOf(l).toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [effectiveLogs, levelFilter, sourceFilter, search]);

  // Oldest first (rendering order). `logs` arrives newest-first from the hook.
  const displayed = useMemo(() => [...filtered].reverse(), [filtered]);

  // Auto-scroll to the bottom as new logs come in
  useEffect(() => {
    if (!autoScroll || paused) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [displayed, autoScroll, paused]);

  const renderMessage = (msg: string) => {
    const q = search.trim();
    if (!q) return msg;
    const idx = msg.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return msg;
    return (
      <>
        {msg.slice(0, idx)}
        <span className="log-highlight">{msg.slice(idx, idx + q.length)}</span>
        {msg.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div className="vt-app flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Toolbar + timeline + stream */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Toolbar */}
          <div
            className="px-6 pt-5 pb-3 flex flex-col gap-3"
            style={{ borderBottom: "1px solid var(--vt-border)" }}
          >
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[240px] max-w-[520px]">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                  style={{ color: "var(--vt-fg-3)" }}
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("logs.searchPlaceholder")}
                  className="vt-hist-search vt-mono"
                  style={{ fontSize: 12.5 }}
                />
                <kbd className="vt-kbd absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  /
                </kbd>
              </div>

              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPaused((v) => !v)}
                  className={"vt-btn vt-btn-sm" + (paused ? " vt-btn-active" : "")}
                >
                  {paused ? (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>{t("logs.resume")}</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span>{t("logs.pause")}</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="vt-btn vt-btn-sm"
                  onClick={() => invoke("open_app_data_dir")}
                  data-tip={t("logs.openFolder")}
                  aria-label={t("logs.openFolder")}
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  className="vt-btn vt-btn-sm"
                  disabled
                  data-tip={t("logs.exportComingSoon")}
                  aria-label={t("logs.export")}
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                {effectiveLogs.length > 0 && (
                  <button
                    type="button"
                    className="vt-btn vt-btn-sm vt-btn-danger"
                    onClick={() => {
                      if (
                        confirm(
                          t("logs.deleteAllConfirm", {
                            count: effectiveLogs.length,
                          }),
                        )
                      ) {
                        onClearLogs();
                      }
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t("logs.deleteAll")}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Status strip */}
            <div
              className="flex items-center gap-4 text-[11px] flex-wrap"
              style={{ color: "var(--vt-fg-3)" }}
            >
              <div className="flex items-center gap-1.5">
                {paused ? (
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: "var(--vt-warn)" }}
                  />
                ) : (
                  <span className="dot-live" />
                )}
                <span className="vt-mono">{paused ? t("logs.paused") : t("logs.live")}</span>
              </div>
              <span>·</span>
              <span className="vt-mono">
                {t("logs.entriesCount", {
                  filtered: filtered.length,
                  total: effectiveLogs.length,
                })}
              </span>
              {counts.error > 0 && (
                <>
                  <span>·</span>
                  <span className="vt-mono" style={{ color: "var(--vt-danger)" }}>
                    {t("logs.errorCount", { count: counts.error })}
                  </span>
                </>
              )}
              {counts.warn > 0 && (
                <>
                  <span>·</span>
                  <span className="vt-mono" style={{ color: "var(--vt-warn)" }}>
                    {t("logs.warningCount", { count: counts.warn })}
                  </span>
                </>
              )}
              {sourceFilter && (
                <>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => onSourceFilterChange(null)}
                    className="vt-mono inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md vt-hover-bg"
                    style={{
                      background: "oklch(from var(--vt-accent) l c h / 0.12)",
                      border: "1px solid oklch(from var(--vt-accent) l c h / 0.3)",
                      color: "var(--vt-accent-2)",
                    }}
                    title={t("logs.removeSourceFilter")}
                  >
                    {t("logs.sourceFilterLabel", {
                      source:
                        sourceFilter === UNKNOWN_SOURCE
                          ? t("logs.unknownSource")
                          : sourceFilter,
                    })}
                    <X className="w-3 h-3" />
                  </button>
                </>
              )}
              <div className="ml-auto flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setShowTimeline((v) => !v)}
                  className="flex items-center gap-2.5"
                >
                  <span className="vt-toggle" data-on={showTimeline} />
                  <span className="vt-mono text-[11px]">{t("logs.timeline")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAutoScroll((v) => !v)}
                  className="flex items-center gap-2.5"
                >
                  <span className="vt-toggle" data-on={autoScroll} />
                  <span className="vt-mono text-[11px]">{t("logs.autoScroll")}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Timeline density */}
          {showTimeline && effectiveLogs.length > 0 && (
            <TimelineStrip logs={effectiveLogs} />
          )}

          {/* Log stream */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto py-2"
            style={{
              background: "oklch(from var(--vt-bg) calc(l - 0.008) c h)",
            }}
          >
            {effectiveLogs.length === 0 ? (
              <div className="py-20 text-center">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
                  style={{
                    background: "var(--vt-hover)",
                    color: "var(--vt-fg-4)",
                  }}
                >
                  <Info className="w-5 h-5" />
                </div>
                <p
                  className="text-[13.5px]"
                  style={{ color: "var(--vt-fg-2)" }}
                >
                  {t("logs.empty")}
                </p>
                <p
                  className="text-[12px] mt-1"
                  style={{ color: "var(--vt-fg-3)" }}
                >
                  {t("logs.emptySubtitle")}
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-20 text-center">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
                  style={{
                    background: "var(--vt-hover)",
                    color: "var(--vt-fg-4)",
                  }}
                >
                  <Search className="w-5 h-5" />
                </div>
                <p
                  className="text-[13.5px]"
                  style={{ color: "var(--vt-fg-2)" }}
                >
                  {t("logs.noMatches")}
                </p>
                <p
                  className="text-[12px] mt-1"
                  style={{ color: "var(--vt-fg-3)" }}
                >
                  {t("logs.noMatchesSubtitle")}
                </p>
              </div>
            ) : (
              <>
                {displayed.map((l) => {
                  const src = sourceOf(l);
                  const srcColor = sourceColor(src);
                  const srcLabel =
                    src === UNKNOWN_SOURCE ? t("logs.unknownSource") : src;
                  const at = parseLogDate(l.timestamp);
                  return (
                    <div
                      key={l.id}
                      className="log-row"
                      data-level={l.level}
                    >
                      <span className="log-time">{fmtTime(at)}</span>
                      <span className="flex items-center">
                        <span className={"lvl-pill lvl-" + l.level}>
                          {l.level.toUpperCase()}
                        </span>
                      </span>
                      <span className="log-msg">
                        <button
                          type="button"
                          onClick={() =>
                            onSourceFilterChange(
                              sourceFilter === src ? null : src,
                            )
                          }
                          className="vt-mono mr-2 font-medium hover:underline"
                          style={{ color: srcColor }}
                          title={t("logs.filterBy", { source: srcLabel })}
                        >
                          {srcLabel}
                        </button>
                        <span style={{ color: "var(--vt-fg-4)" }}>›</span>{" "}
                        {renderMessage(l.message)}
                      </span>
                      <LogRowCopyButton
                        text={`[${fmtTime(at)}] [${l.level.toUpperCase()}] ${l.message}`}
                      />
                    </div>
                  );
                })}
                <div ref={endRef} />
              </>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
