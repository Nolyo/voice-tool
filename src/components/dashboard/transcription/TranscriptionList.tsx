"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Trash2, Sparkles, Download, Filter, Pin } from "lucide-react";
import { GroupedVirtuoso, type GroupedVirtuosoHandle } from "react-virtuoso";
import { type Transcription } from "@/hooks/useTranscriptionHistory";
import { isToday, useDateFormatters } from "@/lib/date-format";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ExportDialog } from "./ExportDialog";
import { TimelineRow } from "./TimelineRow";
import {
  AdvancedFiltersPopover,
  EMPTY_ADV_FILTERS,
  applyAdvFilters,
  countActiveAdvFilters,
  type AdvancedFilters,
} from "./AdvancedFiltersPopover";

interface TranscriptionListProps {
  transcriptions: Transcription[];
  selectedId?: string;
  scrollParent: HTMLElement | null;
  onSelectTranscription: (transcription: Transcription) => void;
  onDelete?: (id: string) => void;
  onClearAll?: () => void;
  onTogglePin?: (id: string) => void | Promise<void>;
}

type FilterId = "all" | "today" | "postprocess" | "pinned";

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

/* ── DayLabel ──────────────────────────────────────────────────────── */
interface DayLabelProps {
  label: string;
  firstAt: Date;
  count: number;
  totalWords: number;
  totalDuration: number;
}

function DayLabel({
  label,
  firstAt,
  count,
  totalWords,
  totalDuration,
}: DayLabelProps) {
  const { t } = useTranslation();
  const { formatShortDate } = useDateFormatters();
  return (
    <div className="day-label">
      <span
        className="vt-mono text-[10.5px]"
        style={{ color: "var(--vt-fg-4)" }}
      >
        {formatShortDate(firstAt)}
      </span>
      <div className="day-label-inner">
        <span className="day-chip">{label}</span>
        <span className="day-chip-count">{count}</span>
        <span
          className="h-px flex-1"
          style={{ background: "var(--vt-border)" }}
        />
        <span className="text-[10.5px]" style={{ color: "var(--vt-fg-4)" }}>
          {t("history.wordsCount", { count: totalWords })}
          {totalDuration > 0 && <> · {durFmt(totalDuration)}</>}
        </span>
      </div>
    </div>
  );
}

/* ── Main list (timeline, toolbar, empty state) ────────────────────── */
export function TranscriptionList({
  transcriptions,
  selectedId,
  scrollParent,
  onSelectTranscription,
  onDelete,
  onClearAll,
  onTogglePin,
}: TranscriptionListProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const [filter, setFilter] = useState<FilterId>("all");
  const [advFilters, setAdvFilters] = useState<AdvancedFilters>(EMPTY_ADV_FILTERS);
  const [advFiltersOpen, setAdvFiltersOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const advFilterBtnRef = useRef<HTMLButtonElement>(null);
  const virtuosoRef = useRef<GroupedVirtuosoHandle>(null);

  const advCount = countActiveAdvFilters(advFilters);

  const openExport = useCallback(() => setExportOpen(true), []);

  const pinnedItems = useMemo(
    () => transcriptions.filter((tr) => Boolean(tr.pinnedAt)),
    [transcriptions],
  );

  const filtered = useMemo(() => {
    let list = transcriptions;

    if (filter === "postprocess") {
      list = list.filter((tr) => Boolean(tr.originalText));
    } else if (filter === "today") {
      list = list.filter((tr) => isToday(parseAt(tr)));
    } else if (filter === "pinned") {
      list = list.filter((tr) => Boolean(tr.pinnedAt));
    }

    list = applyAdvFilters(list, advFilters);

    const q = debouncedSearch.trim();
    if (q) {
      const ql = q.toLowerCase();
      list = list.filter(
        (tr) =>
          tr.text.toLowerCase().includes(ql) ||
          (tr.originalText ?? "").toLowerCase().includes(ql) ||
          tr.date.includes(q) ||
          tr.time.includes(q),
      );
    }

    return list;
  }, [transcriptions, debouncedSearch, filter, advFilters]);

  /**
   * Render a dedicated "Pinned" section above the day-grouped timeline only
   * when the user is in the default unfiltered view (filter=all, no search,
   * no advanced filter, no current "pinned" filter focus). Otherwise the
   * pinned rows already appear inline at the top of `filtered` thanks to
   * `sortTranscriptions`, so a separate section would duplicate them.
   */
  const showPinnedSection =
    pinnedItems.length > 0 &&
    filter === "all" &&
    !debouncedSearch.trim() &&
    advCount === 0;

  /**
   * Day-grouped list. When a dedicated pinned section is shown, exclude
   * pinned rows from the day groups to avoid showing them twice.
   */
  const dayGroupItems = useMemo(
    () =>
      showPinnedSection
        ? filtered.filter((tr) => !tr.pinnedAt)
        : filtered,
    [filtered, showPinnedSection],
  );

  const { dayLabel } = useDateFormatters();

  /**
   * Group items by day label. Result is an ordered array kept in sync with
   * the iteration order of `dayGroupItems` (the source list is already
   * sorted, so groups appear in chronological order of first occurrence).
   */
  const groups = useMemo(() => {
    const map = new Map<string, { items: Transcription[]; firstAt: Date }>();
    for (const tr of dayGroupItems) {
      const at = parseAt(tr);
      const key = dayLabel(at);
      if (!map.has(key)) {
        map.set(key, { items: [], firstAt: at });
      }
      map.get(key)!.items.push(tr);
    }
    return [...map.entries()];
  }, [dayGroupItems, dayLabel]);

  const groupCounts = useMemo(() => groups.map(([, g]) => g.items.length), [groups]);

  /** Cumulative offsets so we can map an absolute virtual index to a local one. */
  const groupStartOffsets = useMemo(() => {
    const offsets: number[] = [];
    let acc = 0;
    for (const c of groupCounts) {
      offsets.push(acc);
      acc += c;
    }
    return offsets;
  }, [groupCounts]);

  /** Map an item id to its absolute index inside the virtualised list. */
  const indexOfItem = useCallback(
    (id: string): number => {
      for (let g = 0; g < groups.length; g++) {
        const items = groups[g][1].items;
        for (let i = 0; i < items.length; i++) {
          if (items[i].id === id) return groupStartOffsets[g] + i;
        }
      }
      return -1;
    },
    [groups, groupStartOffsets],
  );

  const handleSelect = useCallback(
    (item: Transcription) => {
      onSelectTranscription(item);
    },
    [onSelectTranscription],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore key events when typing in inputs (except for our own search box).
      const target = e.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target as HTMLElement | null)?.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
        // Don't open export if user is typing inside the search box specifically;
        // they may be using Ctrl+E for caret movement etc. Open from anywhere else.
        if (target === searchInputRef.current) return;
        if (transcriptions.length === 0) return;
        e.preventDefault();
        openExport();
        return;
      }

      if (e.key === "Escape" && document.activeElement === searchInputRef.current) {
        e.preventDefault();
        setSearch("");
        searchInputRef.current?.blur();
        return;
      }

      // Avoid stealing arrow keys / Enter / Delete from inputs other than our search.
      if (isTyping && target !== searchInputRef.current) return;

      if (filtered.length === 0) return;

      const currentIdx =
        selectedId === undefined
          ? -1
          : filtered.findIndex((tr) => tr.id === selectedId);

      const scrollSelected = (item: Transcription) => {
        // Pinned items are rendered in their own non-virtualised section above
        // the timeline, so they're already visible — no scroll needed.
        if (showPinnedSection && item.pinnedAt) return;
        const absIdx = indexOfItem(item.id);
        if (absIdx >= 0) {
          virtuosoRef.current?.scrollToIndex({
            index: absIdx,
            align: "center",
            behavior: "auto",
          });
        }
      };

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = filtered[Math.min(filtered.length - 1, currentIdx + 1)];
        if (next) {
          onSelectTranscription(next);
          scrollSelected(next);
        }
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = filtered[Math.max(0, currentIdx - 1)];
        if (prev) {
          onSelectTranscription(prev);
          scrollSelected(prev);
        }
        return;
      }
      if (e.key === "Delete" && onDelete && selectedId) {
        if (target === searchInputRef.current) return;
        if (confirm(t("history.deleteConfirm"))) {
          onDelete(selectedId);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    filtered,
    selectedId,
    onSelectTranscription,
    onDelete,
    t,
    transcriptions.length,
    openExport,
    showPinnedSection,
    indexOfItem,
  ]);

  /* itemContent renders one row using its absolute index + group index. */
  const renderItem = useCallback(
    (absoluteIndex: number, groupIndex: number) => {
      const group = groups[groupIndex];
      if (!group) return null;
      const items = group[1].items;
      const localIndex = absoluteIndex - groupStartOffsets[groupIndex];
      const item = items[localIndex];
      if (!item) return null;
      return (
        <div className="px-2">
          <TimelineRow
            item={item}
            at={parseAt(item)}
            isSelected={selectedId === item.id}
            isFirst={localIndex === 0}
            isLast={localIndex === items.length - 1}
            onSelect={handleSelect}
            onDelete={onDelete}
            onTogglePin={onTogglePin}
          />
        </div>
      );
    },
    [groups, groupStartOffsets, selectedId, handleSelect, onDelete, onTogglePin],
  );

  const renderGroup = useCallback(
    (groupIndex: number) => {
      const group = groups[groupIndex];
      if (!group) return null;
      const [label, g] = group;
      const totalWords = g.items.reduce((a, tr) => a + wordsOf(tr.text), 0);
      const totalDuration = g.items.reduce(
        (a, tr) => a + (tr.duration ?? 0),
        0,
      );
      return (
        <DayLabel
          label={label}
          firstAt={g.firstAt}
          count={g.items.length}
          totalWords={totalWords}
          totalDuration={totalDuration}
        />
      );
    },
    [groups],
  );

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
            {pinnedItems.length > 0 && (
              <button
                type="button"
                className="filter-chip"
                data-on={filter === "pinned"}
                onClick={() => setFilter("pinned")}
                aria-label={t("history.filterPinnedWithCount", {
                  count: pinnedItems.length,
                })}
              >
                <Pin className="w-3 h-3" />
                {t("history.filterPinned")}
                <span className="filter-chip-badge" aria-hidden>
                  {pinnedItems.length}
                </span>
              </button>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5 relative">
            <button
              ref={advFilterBtnRef}
              type="button"
              className="vt-btn vt-btn-sm"
              data-on={advCount > 0}
              data-tip={t("history.filterAdvanced")}
              aria-label={t("history.filterAdvanced")}
              aria-expanded={advFiltersOpen}
              onClick={() => setAdvFiltersOpen((v) => !v)}
            >
              <Filter className="w-3.5 h-3.5" />
              {advCount > 0 && (
                <span className="filter-chip-badge" aria-label={t("history.filterCountActive", { count: advCount })}>
                  {advCount}
                </span>
              )}
            </button>
            <AdvancedFiltersPopover
              open={advFiltersOpen}
              onClose={() => setAdvFiltersOpen(false)}
              anchorRef={advFilterBtnRef}
              value={advFilters}
              onChange={setAdvFilters}
              items={transcriptions}
            />
            <button
              type="button"
              className="vt-btn vt-btn-sm"
              data-tip={t("history.exportTooltip")}
              aria-label={t("history.exportLabel")}
              onClick={openExport}
              disabled={transcriptions.length === 0}
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

      </div>

      {/* Pinned section (small, kept un-virtualised) */}
      {showPinnedSection && (
        <div className="mb-1" data-testid="pinned-section">
          <div className="day-label">
            <span
              className="vt-mono text-[10.5px]"
              style={{ color: "var(--vt-fg-4)" }}
              aria-hidden
            >
              <Pin className="inline-block w-3 h-3" />
            </span>
            <div className="day-label-inner">
              <span className="day-chip vt-pin-chip">
                <Pin className="w-3 h-3" aria-hidden />
                {t("history.pinnedSection")}
              </span>
              <span className="day-chip-count">{pinnedItems.length}</span>
              <span
                className="h-px flex-1"
                style={{ background: "var(--vt-border)" }}
              />
              <span
                className="text-[10.5px]"
                style={{ color: "var(--vt-fg-4)" }}
              >
                {t("history.pinnedSectionHint")}
              </span>
            </div>
          </div>
          <div className="px-2">
            {pinnedItems.map((item, i) => (
              <TimelineRow
                key={`pinned-${item.id}`}
                item={item}
                at={parseAt(item)}
                isSelected={selectedId === item.id}
                isFirst={i === 0}
                isLast={i === pinnedItems.length - 1}
                onSelect={handleSelect}
                onDelete={onDelete}
                onTogglePin={onTogglePin}
              />
            ))}
          </div>
        </div>
      )}

      {/* Virtualised day-grouped timeline */}
      {groups.length === 0 && !showPinnedSection ? (
        <div className="py-20 text-center">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
            style={{ background: "var(--vt-hover)", color: "var(--vt-fg-4)" }}
          >
            <Search className="w-5 h-5" />
          </div>
          <p className="text-[13.5px]" style={{ color: "var(--vt-fg-2)" }}>
            {search || filter !== "all" || advCount > 0
              ? filter === "pinned"
                ? t("history.pinnedEmpty")
                : t("history.emptySearch")
              : t("history.empty")}
          </p>
          <p className="text-[12px] mt-1" style={{ color: "var(--vt-fg-3)" }}>
            {search || filter !== "all" || advCount > 0
              ? filter === "pinned"
                ? t("history.pinnedEmptySubtitle")
                : t("history.emptyNoMatches")
              : t("history.emptySubtitle")}
          </p>
        </div>
      ) : (
        groups.length > 0 && (
          <GroupedVirtuoso
            ref={virtuosoRef}
            customScrollParent={scrollParent ?? undefined}
            groupCounts={groupCounts}
            groupContent={renderGroup}
            itemContent={renderItem}
            increaseViewportBy={400}
          />
        )
      )}

      {transcriptions.length > 0 && (
        <div
          className="pt-3 border-t text-[11.5px] vt-mono"
          style={{ borderColor: "var(--vt-border)", color: "var(--vt-fg-4)" }}
        >
          {filtered.length === transcriptions.length
            ? t("history.count", { count: transcriptions.length })
            : t("history.countFiltered", {
                shown: filtered.length,
                total: transcriptions.length,
              })}
        </div>
      )}

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        filteredItems={filtered}
        allItems={transcriptions}
      />
    </div>
  );
}
