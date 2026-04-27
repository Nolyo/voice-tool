"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X, RotateCcw } from "lucide-react";
import type { Transcription } from "@/hooks/useTranscriptionHistory";

export interface AdvancedFilters {
  /** ISO date "YYYY-MM-DD" or empty for no lower bound. */
  dateFrom: string;
  /** ISO date "YYYY-MM-DD" or empty for no upper bound. */
  dateTo: string;
  /** "all" | "api" | "local" */
  source: "all" | "api" | "local";
  /** Specific provider name ("OpenAI", "Groq", "Local", ...) or empty for any. */
  provider: string;
  /** Minimum duration in seconds, or 0 for any. */
  minDurationSec: number;
  /** Show only transcriptions with a non-zero apiCost. */
  withCostOnly: boolean;
  /** Show only post-processed transcriptions (subset of postprocess pill — kept here for consistency). */
  postProcessedOnly: boolean;
}

export const EMPTY_ADV_FILTERS: AdvancedFilters = {
  dateFrom: "",
  dateTo: "",
  source: "all",
  provider: "",
  minDurationSec: 0,
  withCostOnly: false,
  postProcessedOnly: false,
};

export function isAdvFiltersActive(f: AdvancedFilters): boolean {
  return (
    !!f.dateFrom ||
    !!f.dateTo ||
    f.source !== "all" ||
    !!f.provider ||
    f.minDurationSec > 0 ||
    f.withCostOnly ||
    f.postProcessedOnly
  );
}

export function countActiveAdvFilters(f: AdvancedFilters): number {
  let n = 0;
  if (f.dateFrom || f.dateTo) n++;
  if (f.source !== "all") n++;
  if (f.provider) n++;
  if (f.minDurationSec > 0) n++;
  if (f.withCostOnly) n++;
  if (f.postProcessedOnly) n++;
  return n;
}

export function applyAdvFilters(
  items: Transcription[],
  f: AdvancedFilters,
): Transcription[] {
  if (!isAdvFiltersActive(f)) return items;
  return items.filter((t) => {
    if (f.dateFrom && t.date < f.dateFrom) return false;
    if (f.dateTo && t.date > f.dateTo) return false;
    if (f.source === "api" && !(t.apiCost && t.apiCost > 0)) return false;
    if (f.source === "local" && t.apiCost && t.apiCost > 0) return false;
    if (f.provider && t.transcriptionProvider !== f.provider) return false;
    if (f.minDurationSec > 0 && (t.duration ?? 0) < f.minDurationSec) return false;
    if (f.withCostOnly && !(t.apiCost && t.apiCost > 0)) return false;
    if (f.postProcessedOnly && !t.originalText) return false;
    return true;
  });
}

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  value: AdvancedFilters;
  onChange: (next: AdvancedFilters) => void;
  /** Items used to surface available providers in the dropdown. */
  items: Transcription[];
}

export function AdvancedFiltersPopover({
  open,
  onClose,
  anchorRef,
  value,
  onChange,
  items,
}: PopoverProps) {
  const { t } = useTranslation();
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current?.contains(target) ||
        anchorRef.current?.contains(target)
      ) {
        return;
      }
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  const providers = useMemo(() => {
    const set = new Set<string>();
    for (const t of items) {
      if (t.transcriptionProvider) set.add(t.transcriptionProvider);
    }
    return [...set].sort();
  }, [items]);

  if (!open) return null;

  const update = (patch: Partial<AdvancedFilters>) => {
    onChange({ ...value, ...patch });
  };

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={t("history.filters.title")}
      className="vt-adv-filter-popover"
    >
      <div className="vt-adv-filter-header">
        <span className="text-[12.5px] font-semibold" style={{ color: "var(--vt-fg)" }}>
          {t("history.filters.title")}
        </span>
        <button
          type="button"
          className="vt-icon-btn"
          onClick={onClose}
          aria-label={t("common.close")}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="vt-adv-filter-body">
        {/* Date range */}
        <div className="vt-adv-row">
          <label
            className="vt-adv-label"
            htmlFor="vt-adv-date-from"
          >
            {t("history.filters.dateRange")}
          </label>
          <div className="flex items-center gap-2">
            <input
              id="vt-adv-date-from"
              type="date"
              value={value.dateFrom}
              max={value.dateTo || undefined}
              onChange={(e) => update({ dateFrom: e.target.value })}
              className="vt-adv-input"
              aria-label={t("history.filters.dateFrom")}
            />
            <span className="text-[11px]" style={{ color: "var(--vt-fg-4)" }}>
              →
            </span>
            <input
              type="date"
              value={value.dateTo}
              min={value.dateFrom || undefined}
              onChange={(e) => update({ dateTo: e.target.value })}
              className="vt-adv-input"
              aria-label={t("history.filters.dateTo")}
            />
          </div>
        </div>

        {/* Source */}
        <div className="vt-adv-row">
          <label className="vt-adv-label">{t("history.filters.source")}</label>
          <div className="flex gap-1.5 flex-wrap">
            {(["all", "api", "local"] as const).map((id) => (
              <button
                key={id}
                type="button"
                className="filter-chip"
                data-on={value.source === id}
                onClick={() => update({ source: id })}
              >
                {t(`history.filters.source_${id}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Provider (only if there are some) */}
        {providers.length > 0 && (
          <div className="vt-adv-row">
            <label htmlFor="vt-adv-provider" className="vt-adv-label">
              {t("history.filters.provider")}
            </label>
            <select
              id="vt-adv-provider"
              value={value.provider}
              onChange={(e) => update({ provider: e.target.value })}
              className="vt-adv-input"
            >
              <option value="">{t("history.filters.providerAny")}</option>
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Min duration */}
        <div className="vt-adv-row">
          <label htmlFor="vt-adv-min-duration" className="vt-adv-label">
            {t("history.filters.minDuration")}
          </label>
          <div className="flex items-center gap-2">
            <input
              id="vt-adv-min-duration"
              type="number"
              min={0}
              step={5}
              value={value.minDurationSec}
              onChange={(e) =>
                update({ minDurationSec: Math.max(0, Number(e.target.value) || 0) })
              }
              className="vt-adv-input vt-adv-input-num"
            />
            <span className="text-[11.5px]" style={{ color: "var(--vt-fg-3)" }}>
              {t("history.filters.seconds")}
            </span>
          </div>
        </div>

        {/* Toggles */}
        <div className="vt-adv-row">
          <label className="vt-checkbox-row">
            <input
              type="checkbox"
              checked={value.withCostOnly}
              onChange={(e) => update({ withCostOnly: e.target.checked })}
            />
            <span style={{ color: "var(--vt-fg)" }}>
              {t("history.filters.withCostOnly")}
            </span>
          </label>
          <label className="vt-checkbox-row">
            <input
              type="checkbox"
              checked={value.postProcessedOnly}
              onChange={(e) => update({ postProcessedOnly: e.target.checked })}
            />
            <span style={{ color: "var(--vt-fg)" }}>
              {t("history.filters.postProcessedOnly")}
            </span>
          </label>
        </div>
      </div>

      <div className="vt-adv-filter-footer">
        <button
          type="button"
          className="vt-btn vt-btn-sm"
          onClick={() => onChange(EMPTY_ADV_FILTERS)}
          disabled={!isAdvFiltersActive(value)}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {t("history.filters.reset")}
        </button>
        <button
          type="button"
          className="vt-btn vt-btn-sm vt-btn-primary"
          onClick={onClose}
        >
          {t("common.done")}
        </button>
      </div>
    </div>
  );
}
