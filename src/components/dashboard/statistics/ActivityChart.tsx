import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DailyBucket } from "@/hooks/useStatistics";
import { useDateFormatters } from "@/lib/date-format";

interface ActivityChartProps {
  buckets: DailyBucket[];
}

export function ActivityChart({ buckets }: ActivityChartProps) {
  const { t } = useTranslation();
  const { formatMonthDay, dayLabel } = useDateFormatters();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const max = useMemo(
    () => Math.max(1, ...buckets.map((b) => b.count)),
    [buckets],
  );

  const todayIso = useMemo(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, []);

  const total = useMemo(
    () => buckets.reduce((acc, b) => acc + b.count, 0),
    [buckets],
  );

  const hover = hoverIdx !== null ? buckets[hoverIdx] : null;

  return (
    <div className="vt-card-elevated p-5">
      <div className="flex items-end justify-between gap-3 mb-4">
        <div>
          <h3 className="vt-display text-[14px] font-semibold text-[var(--vt-fg)]">
            {t("statistics.activity30Title")}
          </h3>
          <p className="text-[12px] text-[var(--vt-fg-3)] mt-0.5">
            {t("statistics.activity30Subtitle", { count: total })}
          </p>
        </div>
        {hover ? (
          <div className="text-right leading-tight">
            <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--vt-fg-4)]">
              {dayLabel(hover.date)}
            </div>
            <div className="text-[16px] font-semibold vt-mono text-[var(--vt-fg)]">
              {hover.count}
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-[var(--vt-fg-4)]">
            {t("statistics.hoverHint")}
          </div>
        )}
      </div>

      <div
        className="flex items-end gap-[3px] h-[140px]"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {buckets.map((b, i) => {
          const ratio = b.count / max;
          const isToday = b.iso === todayIso;
          const isHover = hoverIdx === i;
          const minH = b.count > 0 ? 6 : 2;
          const h = Math.max(minH, Math.round(ratio * 134));
          return (
            <div
              key={b.iso}
              className="flex-1 h-full flex flex-col justify-end items-center group cursor-default"
              onMouseEnter={() => setHoverIdx(i)}
            >
              <div
                className="w-full rounded-[3px] transition-colors"
                style={{
                  height: `${h}px`,
                  background:
                    b.count === 0
                      ? "var(--vt-hover)"
                      : isHover
                        ? "var(--vt-accent)"
                        : isToday
                          ? "var(--vt-accent-2)"
                          : `oklch(from var(--vt-accent) l c h / ${0.35 + ratio * 0.5})`,
                  outline: isToday ? "1px solid var(--vt-accent)" : undefined,
                  outlineOffset: -1,
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex justify-between text-[10.5px] text-[var(--vt-fg-4)] vt-mono">
        <span>{formatMonthDay(buckets[0].date)}</span>
        <span>{formatMonthDay(buckets[Math.floor(buckets.length / 2)].date)}</span>
        <span>{formatMonthDay(buckets[buckets.length - 1].date)}</span>
      </div>
    </div>
  );
}
