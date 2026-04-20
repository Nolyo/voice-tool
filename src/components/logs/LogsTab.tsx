"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowLeft,
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

interface LogsTabProps {
  logs: AppLog[];
  onClearLogs: () => void;
  levelFilter: LevelFilter;
  sourceFilter: string | null;
  onSourceFilterChange: (next: string | null) => void;
  isCompact: boolean;
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

/** Display label for logs missing a source (legacy entries or trace paths). */
export const UNKNOWN_SOURCE = "inconnu";

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

function getLevelCssColor(level: LogLevel): string {
  switch (level) {
    case "error":
      return "var(--vt-danger)";
    case "warn":
      return "var(--vt-warn)";
    case "info":
      return "var(--vt-info)";
    case "debug":
      return "var(--vt-debug)";
    case "trace":
      return "var(--vt-trace)";
  }
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

/* ── Detail panel ──────────────────────────────────────────────── */
function LogDetail({
  log,
  onClose,
  onCopy,
  compact = false,
}: {
  log: AppLog | null;
  onClose: () => void;
  onCopy: (text: string) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  if (!log) {
    return (
      <div
        className="vt-card-sectioned p-8 text-center flex flex-col items-center gap-3"
        style={{ minHeight: 320 }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "oklch(1 0 0 / 0.04)", color: "var(--vt-fg-4)" }}
        >
          <Info className="w-4 h-4" />
        </div>
        <div>
          <div className="text-[13px] font-medium">
            Aucune entrée sélectionnée
          </div>
          <div
            className="text-[11.5px] mt-0.5"
            style={{ color: "var(--vt-fg-3)" }}
          >
            Clique sur une ligne pour voir ses détails.
          </div>
        </div>
      </div>
    );
  }

  const levelColor = getLevelCssColor(log.level);
  const at = parseLogDate(log.timestamp);

  return (
    <div
      className="vt-card-sectioned vt-fade-up overflow-hidden"
      key={log.id}
    >
      <div
        className="flex items-start gap-3 px-5 pt-5 pb-4"
        style={{ borderBottom: "1px solid var(--vt-border)" }}
      >
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: `oklch(from ${levelColor} l c h / 0.15)`,
            color: levelColor,
            boxShadow: `inset 0 0 0 1px oklch(from ${levelColor} l c h / 0.3)`,
          }}
        >
          {log.level === "error" || log.level === "warn" ? (
            <AlertTriangle className="w-4 h-4" />
          ) : (
            <Info className="w-4 h-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={"lvl-pill lvl-" + log.level}>
              {log.level.toUpperCase()}
            </span>
            <span className="text-[14px] font-semibold tracking-tight">
              #{log.id.slice(0, 6)}
            </span>
          </div>
          <div
            className="flex items-center gap-2 mt-1.5 text-[11.5px] flex-wrap"
            style={{ color: "var(--vt-fg-3)" }}
          >
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: sourceColor(sourceOf(log)) }}
              />
              <span
                className="vt-mono"
                style={{ color: sourceColor(sourceOf(log)) }}
              >
                {sourceOf(log)}
              </span>
            </span>
            <span>·</span>
            <span className="vt-mono">{fmtTime(at)}</span>
            <span>·</span>
            <span className="vt-mono">
              {at.toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "short",
              })}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={
            compact
              ? "inline-flex items-center gap-1.5 px-2 h-7 rounded-md text-[12px] hover:bg-white/5"
              : "w-7 h-7 rounded-md flex items-center justify-center hover:bg-white/5"
          }
          style={{ color: "var(--vt-fg-3)" }}
          aria-label={
            compact
              ? t("transcriptionDetails.backToList", {
                  defaultValue: "Retour à la liste",
                })
              : "Fermer"
          }
        >
          {compact ? (
            <>
              <ArrowLeft className="w-3.5 h-3.5" />
              {t("transcriptionDetails.back", { defaultValue: "Retour" })}
            </>
          ) : (
            <X className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      <div
        className="px-5 py-4"
        style={{ borderBottom: "1px solid var(--vt-border)" }}
      >
        <div
          className="text-[10.5px] uppercase tracking-wider mb-2"
          style={{ color: "var(--vt-fg-4)" }}
        >
          Message
        </div>
        <div
          className="vt-mono text-[12.5px] leading-relaxed p-3 rounded-lg whitespace-pre-wrap"
          style={{
            background: "var(--vt-surface)",
            border: "1px solid var(--vt-border)",
            color: "var(--vt-fg)",
          }}
        >
          {log.message}
        </div>
      </div>

      <div className="px-5 py-3 flex items-center gap-2">
        <button
          type="button"
          className="vt-btn-primary"
          style={{ height: 30, fontSize: 12 }}
          onClick={() =>
            onCopy(
              `[${fmtTime(at)}] [${log.level.toUpperCase()}] ${log.message}`,
            )
          }
        >
          <Copy className="w-3.5 h-3.5" />
          Copier la ligne
        </button>
        <button
          type="button"
          className="vt-btn vt-btn-sm"
          onClick={() => invoke("open_app_data_dir")}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          {t("logs.openFolder")}
        </button>
      </div>
    </div>
  );
}

/* ── Main LogsTab ──────────────────────────────────────────────── */
export function LogsTab({
  logs,
  onClearLogs,
  levelFilter,
  sourceFilter,
  onSourceFilterChange,
  isCompact,
}: LogsTabProps) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const [snapshot, setSnapshot] = useState<AppLog[] | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
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

  const selected = useMemo(
    () => effectiveLogs.find((l) => l.id === selectedId) ?? null,
    [effectiveLogs, selectedId],
  );

  // Auto-scroll to the bottom as new logs come in
  useEffect(() => {
    if (!autoScroll || paused) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [displayed, autoScroll, paused]);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, []);

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

  const showDetailOnly = isCompact && selected !== null;
  const showStreamOnly = isCompact && selected === null;

  return (
    <div className="vt-app flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left: toolbar + timeline + stream */}
        <div
          className="flex-1 flex flex-col min-w-0"
          style={{ display: showDetailOnly ? "none" : undefined }}
        >
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
                  placeholder="Rechercher dans les messages…"
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
                      <span>Reprendre</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pause</span>
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
                  data-tip="Export (bientôt)"
                  aria-label="Exporter"
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
                        setSelectedId(null);
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
                <span className="vt-mono">{paused ? "Pausé" : "En direct"}</span>
              </div>
              <span>·</span>
              <span className="vt-mono">
                {filtered.length} / {effectiveLogs.length} entrées
              </span>
              {counts.error > 0 && (
                <>
                  <span>·</span>
                  <span className="vt-mono" style={{ color: "var(--vt-danger)" }}>
                    {counts.error} erreur{counts.error > 1 ? "s" : ""}
                  </span>
                </>
              )}
              {counts.warn > 0 && (
                <>
                  <span>·</span>
                  <span className="vt-mono" style={{ color: "var(--vt-warn)" }}>
                    {counts.warn} avertissement{counts.warn > 1 ? "s" : ""}
                  </span>
                </>
              )}
              {sourceFilter && (
                <>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => onSourceFilterChange(null)}
                    className="vt-mono inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md hover:bg-white/5"
                    style={{
                      background: "oklch(from var(--vt-accent) l c h / 0.12)",
                      border: "1px solid oklch(from var(--vt-accent) l c h / 0.3)",
                      color: "var(--vt-accent-2)",
                    }}
                    title="Retirer le filtre de source"
                  >
                    source = {sourceFilter}
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
                  <span className="vt-mono text-[11px]">chronologie</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAutoScroll((v) => !v)}
                  className="flex items-center gap-2.5"
                >
                  <span className="vt-toggle" data-on={autoScroll} />
                  <span className="vt-mono text-[11px]">auto-scroll</span>
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
                    background: "oklch(1 0 0 / 0.04)",
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
                    background: "oklch(1 0 0 / 0.04)",
                    color: "var(--vt-fg-4)",
                  }}
                >
                  <Search className="w-5 h-5" />
                </div>
                <p
                  className="text-[13.5px]"
                  style={{ color: "var(--vt-fg-2)" }}
                >
                  Aucune entrée ne correspond
                </p>
                <p
                  className="text-[12px] mt-1"
                  style={{ color: "var(--vt-fg-3)" }}
                >
                  Essaie d'autres mots-clés ou active des niveaux.
                </p>
              </div>
            ) : (
              <>
                {displayed.map((l) => {
                  const src = sourceOf(l);
                  const srcColor = sourceColor(src);
                  return (
                    <div
                      key={l.id}
                      className="log-row"
                      data-level={l.level}
                      data-selected={selectedId === l.id}
                      onClick={() => setSelectedId(l.id)}
                    >
                      <span className="log-time">
                        {fmtTime(parseLogDate(l.timestamp))}
                      </span>
                      <span className="flex items-center">
                        <span className={"lvl-pill lvl-" + l.level}>
                          {l.level.toUpperCase()}
                        </span>
                      </span>
                      <span className="log-msg">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSourceFilterChange(
                              sourceFilter === src ? null : src,
                            );
                          }}
                          className="vt-mono mr-2 font-medium hover:underline"
                          style={{ color: srcColor }}
                          title={`Filtrer sur ${src}`}
                        >
                          {src}
                        </button>
                        <span style={{ color: "var(--vt-fg-4)" }}>›</span>{" "}
                        {renderMessage(l.message)}
                      </span>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </>
            )}
          </div>
        </div>

        {/* Right: detail panel */}
        {!showStreamOnly && (
          <div
            className={
              showDetailOnly
                ? "flex-1 min-w-0 p-5 overflow-y-auto"
                : "shrink-0 p-5 overflow-y-auto"
            }
            style={{
              width: showDetailOnly ? undefined : 400,
              borderLeft: showDetailOnly
                ? undefined
                : "1px solid var(--vt-border)",
              background: "oklch(from var(--vt-bg) calc(l - 0.005) c h)",
            }}
          >
            <LogDetail
              log={selected}
              onClose={() => setSelectedId(null)}
              onCopy={handleCopy}
              compact={isCompact}
            />
          </div>
        )}
      </div>

      {/* Toast */}
      {copied && (
        <div
          className="fixed bottom-5 left-1/2 -translate-x-1/2 px-3.5 py-2 rounded-lg text-[12.5px] font-medium flex items-center gap-2 vt-fade-up"
          style={{
            background: "oklch(0.1 0 0)",
            border: "1px solid var(--vt-border)",
            color: "var(--vt-fg)",
            zIndex: 50,
            boxShadow: "0 10px 40px -10px rgba(0,0,0,.6)",
          }}
        >
          <span
            className="w-4 h-4 rounded-full flex items-center justify-center"
            style={{ background: "var(--vt-ok-soft)", color: "var(--vt-ok)" }}
          >
            <Check className="w-2.5 h-2.5" />
          </span>
          Copié
        </div>
      )}
    </div>
  );
}
