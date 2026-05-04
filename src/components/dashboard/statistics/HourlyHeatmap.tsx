import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

interface HourlyHeatmapProps {
  matrix: number[][]; // 7 rows × 24 cols, Sunday=0
}

export function HourlyHeatmap({ matrix }: HourlyHeatmapProps) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);

  const max = useMemo(() => {
    let m = 0;
    for (const row of matrix) for (const v of row) if (v > m) m = v;
    return Math.max(1, m);
  }, [matrix]);

  // Reorder rows to Mon-first for FR friendliness, but keep mapping clear.
  const rowOrder = [1, 2, 3, 4, 5, 6, 0];
  const dayKeys = [
    "statistics.day.mon",
    "statistics.day.tue",
    "statistics.day.wed",
    "statistics.day.thu",
    "statistics.day.fri",
    "statistics.day.sat",
    "statistics.day.sun",
  ];

  const total = useMemo(() => {
    let s = 0;
    for (const row of matrix) for (const v of row) s += v;
    return s;
  }, [matrix]);

  return (
    <div className="vt-card-elevated p-5">
      <div className="flex items-end justify-between gap-3 mb-4">
        <div>
          <h3 className="vt-display text-[14px] font-semibold text-[var(--vt-fg)]">
            {t("statistics.heatmapTitle")}
          </h3>
          <p className="text-[12px] text-[var(--vt-fg-3)] mt-0.5">
            {t("statistics.heatmapSubtitle")}
          </p>
        </div>
        {hover ? (
          <div className="text-right leading-tight">
            <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--vt-fg-4)]">
              {t(dayKeys[rowOrder.indexOf(hover.d)])} · {String(hover.h).padStart(2, "0")}h
            </div>
            <div className="text-[16px] font-semibold vt-mono text-[var(--vt-fg)]">
              {matrix[hover.d][hover.h]}
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-[var(--vt-fg-4)] vt-mono">
            {t("statistics.totalLabel")}: {total}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {/* Day labels column */}
        <div className="flex flex-col gap-[3px] pt-[14px]">
          {rowOrder.map((d, i) => (
            <div
              key={d}
              className="h-[16px] flex items-center text-[10px] text-[var(--vt-fg-4)] tracking-wide"
              style={{ width: 24 }}
            >
              {i % 2 === 0 ? t(dayKeys[i]).slice(0, 3) : ""}
            </div>
          ))}
        </div>

        {/* Grid + hour ticks */}
        <div className="flex-1">
          <div className="flex justify-between text-[9.5px] text-[var(--vt-fg-4)] mb-1 px-[1px] vt-mono">
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>23</span>
          </div>
          <div className="flex flex-col gap-[3px]">
            {rowOrder.map((d) => (
              <div key={d} className="flex gap-[3px]">
                {Array.from({ length: 24 }, (_, h) => {
                  const v = matrix[d][h];
                  const ratio = v / max;
                  const isHover = hover?.d === d && hover?.h === h;
                  return (
                    <div
                      key={h}
                      onMouseEnter={() => setHover({ d, h })}
                      onMouseLeave={() => setHover(null)}
                      className="flex-1 rounded-[3px] cursor-default transition-all"
                      style={{
                        height: 16,
                        minWidth: 0,
                        background:
                          v === 0
                            ? "var(--vt-hover)"
                            : `oklch(from var(--vt-accent) l c h / ${0.18 + ratio * 0.7})`,
                        outline: isHover
                          ? "1px solid var(--vt-accent-2)"
                          : undefined,
                        outlineOffset: -1,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <span className="text-[10.5px] text-[var(--vt-fg-4)]">
          {t("statistics.legendLess")}
        </span>
        {[0.18, 0.35, 0.55, 0.78, 0.95].map((r, i) => (
          <span
            key={i}
            className="w-3 h-3 rounded-[3px]"
            style={{ background: `oklch(from var(--vt-accent) l c h / ${r})` }}
          />
        ))}
        <span className="text-[10.5px] text-[var(--vt-fg-4)]">
          {t("statistics.legendMore")}
        </span>
      </div>
    </div>
  );
}
