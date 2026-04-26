"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Check, Copy, Trash2, Sparkles, Download, Filter } from "lucide-react";
import { type Transcription } from "@/hooks/useTranscriptionHistory";
import { isToday, useDateFormatters } from "@/lib/date-format";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";

interface TranscriptionListProps {
  transcriptions: Transcription[];
  selectedId?: string;
  onSelectTranscription: (transcription: Transcription) => void;
  onDelete?: (id: string) => void;
  onClearAll?: () => void;
}

type FilterId = "all" | "today" | "postprocess";

/**
 * Parse stored "YYYY-MM-DD" + "HH:mm:ss" (FR locale) pair into a Date.
 * Falls back to `new Date(date + " " + time)` for resilience.
 */
function parseAt(t: Transcription): Date {
  const iso = `${t.date}T${t.time}`;
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) return d;
  return new Date(`${t.date} ${t.time}`);
}

function durFmt(s?: number): string {
  if (!s || s <= 0) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

function wordsOf(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/* ── Row ────────────────────────────────────────────────────────────── */
interface RowProps {
  item: Transcription;
  at: Date;
  isSelected: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}

function TimelineRow({ item, at, isSelected, isFirst, isLast, onSelect, onDelete }: RowProps) {
  const { t } = useTranslation();
  const { copy, justCopied } = useCopyToClipboard();
  const { formatTime } = useDateFormatters();
  const words = wordsOf(item.text);
  const postProcess = Boolean(item.originalText);
  const source = item.apiCost !== undefined && item.apiCost > 0 ? "api" : "local";

  return (
    <div
      className={
        "hist-row group" +
        (isFirst ? " hist-rail-first" : "") +
        (isLast ? " hist-rail-last" : "")
      }
      data-selected={isSelected}
      data-postprocess={postProcess}
      data-source={source}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="vt-mono text-[11.5px] hist-time" style={{ color: "var(--vt-fg-3)" }}>
        {formatTime(at)}
      </div>
      <div className="hist-dot">
        <span className="hist-dot-circle" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          {source === "api" && item.transcriptionProvider && (
            <span
              className="inline-flex items-center px-1.5 h-4 rounded text-[10px] font-medium"
              style={{
                background: "oklch(0.72 0.14 205 / 0.16)",
                color: "oklch(0.72 0.14 205)",
              }}
              title={t("history.legendApiCloud")}
            >
              {item.transcriptionProvider}
            </span>
          )}
          {postProcess && (
            <span
              className="inline-flex items-center gap-1 px-1.5 h-4 rounded text-[10px] font-medium"
              style={{
                background: "oklch(0.72 0.17 295 / 0.16)",
                color: "oklch(0.72 0.17 295)",
              }}
              title={t("history.postProcessedBadge")}
            >
              <Sparkles className="w-2.5 h-2.5" aria-hidden />
              <span>IA</span>
            </span>
          )}
          <span className="text-[11px]" style={{ color: "var(--vt-fg-4)" }}>
            {item.duration !== undefined && item.duration > 0 && (
              <>
                <span className="vt-mono">{durFmt(item.duration)}</span>
                <span className="mx-1.5">·</span>
              </>
            )}
            <span className="vt-mono">
              {t("history.wordsCount", { count: words })}
            </span>
            {item.apiCost !== undefined && item.apiCost > 0 && (
              <>
                <span className="mx-1.5">·</span>
                <span className="vt-mono">${item.apiCost.toFixed(4)}</span>
              </>
            )}
          </span>
        </div>
        <div className="text-[13px] truncate" style={{ color: "var(--vt-fg)" }}>
          {item.text.split("\n")[0] || item.text}
        </div>
      </div>
      <div
        className="flex items-center gap-0.5 transition"
        style={{ opacity: isSelected ? 1 : undefined }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            copy(item.text);
          }}
          className="w-7 h-7 rounded-md flex items-center justify-center vt-hover-bg"
          style={{ color: justCopied ? "var(--vt-ok)" : "var(--vt-fg-3)" }}
          data-tip={justCopied ? t("common.copied") : t("transcriptionDetails.copy")}
          aria-label={t("transcriptionDetails.copy")}
        >
          {justCopied ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(t("history.deleteConfirm"))) {
                onDelete();
              }
            }}
            className="w-7 h-7 rounded-md flex items-center justify-center vt-hover-bg hover:text-red-400"
            style={{ color: "var(--vt-fg-3)" }}
            data-tip={t("history.deleteTooltip")}
            aria-label={t("history.deleteConfirm")}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Stats row (top of page) ───────────────────────────────────────── */
function StatsRow({ transcriptions }: { transcriptions: Transcription[] }) {
  const { t } = useTranslation();
  const stats = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);

    let weekCount = 0;
    let totalDuration = 0;
    let measuredDuration = 0;
    let measuredWords = 0;
    let measuredCount = 0;
    const dailyBuckets = new Array(14).fill(0);

    for (const t of transcriptions) {
      const at = parseAt(t);
      const atMid = new Date(at);
      atMid.setHours(0, 0, 0, 0);
      const diff = Math.round((now.getTime() - atMid.getTime()) / 86400000);

      if (diff >= 0 && diff < 7) weekCount++;
      if (diff >= 0 && diff < 14) dailyBuckets[13 - diff]++;

      const dur = t.duration ?? 0;
      totalDuration += dur;
      if (dur > 0) {
        measuredDuration += dur;
        measuredWords += wordsOf(t.text);
        measuredCount++;
      }
    }

    const avgDur =
      measuredCount > 0 ? Math.round(measuredDuration / measuredCount) : 0;
    const wpm =
      measuredDuration > 0
        ? Math.round(measuredWords / (measuredDuration / 60))
        : 0;

    return { weekCount, totalDuration, avgDur, wpm, dailyBuckets };
  }, [transcriptions]);

  const maxBucket = Math.max(1, ...stats.dailyBuckets);
  const totalMin = Math.floor(stats.totalDuration / 60);
  const totalSec = Math.round(stats.totalDuration % 60);

  return (
    <div className="grid grid-cols-4 gap-3">
      <div className="stat-tile">
        <div className="lbl">{t("history.statsThisWeek")}</div>
        <div className="val">{stats.weekCount}</div>
        <div className="trend">
          {t("history.statsDictationsWeek", { count: stats.weekCount })}
        </div>
      </div>
      <div className="stat-tile">
        <div className="lbl">{t("history.statsSpokenTime")}</div>
        <div className="val">
          {totalMin}
          <span
            className="text-[14px] font-normal vt-mono ml-0.5"
            style={{ color: "var(--vt-fg-3)" }}
          >
            m {String(totalSec).padStart(2, "0")}s
          </span>
        </div>
        <div className="trend">
          {t("history.statsAverageDuration", { duration: durFmt(stats.avgDur) })}
        </div>
      </div>
      <div className="stat-tile">
        <div className="lbl">{t("history.statsWordsPerMinute")}</div>
        <div className="val">{stats.wpm}</div>
        <div className="trend">
          {stats.wpm === 0 ? "—" : t("history.statsAverageAcrossHistory")}
        </div>
      </div>
      <div className="stat-tile">
        <div className="lbl">{t("history.statsActivity14d")}</div>
        <div className="mt-1.5">
          <svg
            width="100%"
            height="36"
            viewBox="0 0 140 36"
            preserveAspectRatio="none"
          >
            {stats.dailyBuckets.map((v, i) => {
              const h = Math.max(3, (v / maxBucket) * 32);
              const today = i === stats.dailyBuckets.length - 1;
              return (
                <rect
                  key={i}
                  x={i * 10 + 1}
                  y={36 - h}
                  width={8}
                  height={h}
                  rx={1.5}
                  fill={
                    today
                      ? "var(--vt-accent)"
                      : "oklch(from var(--vt-accent) l c h / 0.3)"
                  }
                />
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ── Main list (timeline, toolbar, empty state) ────────────────────── */
export function TranscriptionList({
  transcriptions,
  selectedId,
  onSelectTranscription,
  onDelete,
  onClearAll,
}: TranscriptionListProps) {
  const { t } = useTranslation();
  const { dayLabel, formatShortDate } = useDateFormatters();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filtered = useMemo(() => {
    let list = transcriptions;

    if (filter === "postprocess") {
      list = list.filter((tr) => Boolean(tr.originalText));
    } else if (filter === "today") {
      list = list.filter((tr) => isToday(parseAt(tr)));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (tr) =>
          tr.text.toLowerCase().includes(q) ||
          (tr.originalText ?? "").toLowerCase().includes(q) ||
          tr.date.includes(search) ||
          tr.time.includes(search),
      );
    }

    return list;
  }, [transcriptions, search, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, { items: Transcription[]; firstAt: Date }>();
    for (const tr of filtered) {
      const at = parseAt(tr);
      const key = dayLabel(at);
      if (!map.has(key)) {
        map.set(key, { items: [], firstAt: at });
      }
      map.get(key)!.items.push(tr);
    }
    return [...map.entries()];
  }, [filtered, dayLabel]);

  return (
    <div className="flex flex-col min-w-0">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 pb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-[520px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
              style={{ color: "var(--vt-fg-3)" }}
            />
            <input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("history.search")}
              className="vt-hist-search"
            />
            <kbd className="vt-kbd absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              Ctrl K
            </kbd>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="filter-chip"
              data-on={filter === "all"}
              onClick={() => setFilter("all")}
            >
              {t("history.filterAll")}
            </button>
            <button
              type="button"
              className="filter-chip"
              data-on={filter === "today"}
              onClick={() => setFilter("today")}
            >
              {t("common.today")}
            </button>
            <button
              type="button"
              className="filter-chip"
              data-on={filter === "postprocess"}
              onClick={() => setFilter("postprocess")}
            >
              <Sparkles className="w-3 h-3" />
              {t("history.filterPostProcessed")}
            </button>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              className="vt-btn vt-btn-sm"
              data-tip={t("history.filterAdvancedComingSoon")}
              aria-label={t("history.filterAdvanced")}
              disabled
            >
              <Filter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="vt-btn vt-btn-sm"
              data-tip={t("history.exportComingSoon")}
              aria-label={t("history.exportLabel")}
              disabled
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t("history.exportLabel")}</span>
            </button>
            {onClearAll && transcriptions.length > 0 && (
              <button
                type="button"
                className="vt-btn vt-btn-sm vt-btn-danger"
                onClick={() => {
                  if (
                    confirm(
                      t("history.deleteAllConfirm", {
                        count: transcriptions.length,
                      }),
                    )
                  ) {
                    onClearAll();
                  }
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t("history.deleteAll")}</span>
              </button>
            )}
          </div>
        </div>

        <StatsRow transcriptions={transcriptions} />
      </div>

      {/* Timeline */}
      <div className="pb-6">
        {groups.length === 0 ? (
          <div className="py-20 text-center">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
              style={{ background: "var(--vt-hover)", color: "var(--vt-fg-4)" }}
            >
              <Search className="w-5 h-5" />
            </div>
            <p className="text-[13.5px]" style={{ color: "var(--vt-fg-2)" }}>
              {search || filter !== "all"
                ? t("history.emptySearch")
                : t("history.empty")}
            </p>
            <p className="text-[12px] mt-1" style={{ color: "var(--vt-fg-3)" }}>
              {search || filter !== "all"
                ? t("history.emptyNoMatches")
                : t("history.emptySubtitle")}
            </p>
          </div>
        ) : (
          groups.map(([label, group]) => {
            const groupWords = group.items.reduce(
              (a, tr) => a + wordsOf(tr.text),
              0,
            );
            const groupDur = group.items.reduce(
              (a, tr) => a + (tr.duration ?? 0),
              0,
            );
            return (
              <div key={label} className="mb-1">
                <div className="day-label">
                  <span
                    className="vt-mono text-[10.5px]"
                    style={{ color: "var(--vt-fg-4)" }}
                  >
                    {formatShortDate(group.firstAt)}
                  </span>
                  <div className="day-label-inner">
                    <span className="day-chip">{label}</span>
                    <span className="day-chip-count">{group.items.length}</span>
                    <span
                      className="h-px flex-1"
                      style={{ background: "var(--vt-border)" }}
                    />
                    <span
                      className="text-[10.5px]"
                      style={{ color: "var(--vt-fg-4)" }}
                    >
                      {t("history.wordsCount", { count: groupWords })}
                      {groupDur > 0 && <> · {durFmt(groupDur)}</>}
                    </span>
                  </div>
                </div>
                <div className="px-2">
                  {group.items.map((item, i) => (
                    <TimelineRow
                      key={item.id}
                      item={item}
                      at={parseAt(item)}
                      isSelected={selectedId === item.id}
                      isFirst={i === 0}
                      isLast={i === group.items.length - 1}
                      onSelect={() => onSelectTranscription(item)}
                      onDelete={onDelete ? () => onDelete(item.id) : undefined}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {transcriptions.length > 0 && (
        <div
          className="pt-3 border-t text-[11.5px] vt-mono"
          style={{ borderColor: "var(--vt-border)", color: "var(--vt-fg-4)" }}
        >
          {t("history.count", { count: transcriptions.length })}
        </div>
      )}
    </div>
  );
}
