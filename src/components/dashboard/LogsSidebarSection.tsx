import { useMemo } from "react";
import type { AppLog } from "@/hooks/useAppLogs";
import {
  sourceColor,
  sourceOf,
  type LevelFilter,
  type LogLevel,
} from "@/components/logs/LogsTab";

interface LogsSidebarSectionProps {
  logs: AppLog[];
  levelFilter: LevelFilter;
  onLevelFilterChange: (next: LevelFilter) => void;
  sourceFilter: string | null;
  onSourceFilterChange: (next: string | null) => void;
}

const LEVELS: { id: LogLevel; label: string; color: string }[] = [
  { id: "error", label: "ERROR", color: "oklch(0.7 0.2 25)" },
  { id: "warn", label: "WARN", color: "oklch(0.78 0.14 75)" },
  { id: "info", label: "INFO", color: "oklch(0.72 0.15 240)" },
  { id: "debug", label: "DEBUG", color: "oklch(0.7 0.02 264)" },
  { id: "trace", label: "TRACE", color: "oklch(0.72 0.17 295)" },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-1 mt-4 mb-2 text-[10.5px] font-semibold tracking-[0.1em] uppercase text-muted-foreground/80">
      {children}
    </div>
  );
}

/**
 * Sub-content for the Logs tab. Shares level & source filter state with
 * `LogsTab` — toggling here updates the stream.
 */
export function LogsSidebarSection({
  logs,
  levelFilter,
  onLevelFilterChange,
  sourceFilter,
  onSourceFilterChange,
}: LogsSidebarSectionProps) {
  const counts = useMemo(() => {
    const c: Record<LogLevel, number> = {
      error: 0,
      warn: 0,
      info: 0,
      debug: 0,
      trace: 0,
    };
    for (const l of logs) c[l.level]++;
    return c;
  }, [logs]);

  const sources = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) {
      const s = sourceOf(l);
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count);
  }, [logs]);

  const toggle = (id: LogLevel) =>
    onLevelFilterChange({ ...levelFilter, [id]: !levelFilter[id] });

  return (
    <div className="flex-1 overflow-y-auto px-2 pb-3 min-h-0">
      <SectionTitle>Niveaux</SectionTitle>
      <div className="space-y-1">
        {LEVELS.map((l) => {
          const on = levelFilter[l.id];
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => toggle(l.id)}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition hover:bg-foreground/[0.03]"
              style={{
                background: on ? "oklch(1 0 0 / 0.04)" : "transparent",
                opacity: on ? 1 : 0.45,
              }}
              aria-pressed={on}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: l.color }}
              />
              <span
                className={`font-mono text-[11px] font-medium flex-1 text-left ${on ? "text-foreground" : "text-muted-foreground"}`}
              >
                {l.label}
              </span>
              <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded bg-foreground/[0.04] border border-border/60 text-muted-foreground">
                {counts[l.id]}
              </span>
            </button>
          );
        })}
      </div>

      {sources.length > 0 && (
        <>
          <SectionTitle>Sources</SectionTitle>
          <div className="space-y-0.5 max-h-[220px] overflow-y-auto pr-1">
            <button
              type="button"
              onClick={() => onSourceFilterChange(null)}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition"
              style={{
                background:
                  sourceFilter === null
                    ? "oklch(from var(--primary) l c h / 0.12)"
                    : "transparent",
                color:
                  sourceFilter === null
                    ? "var(--primary)"
                    : "var(--muted-foreground)",
              }}
            >
              <span className="text-[12px] flex-1 text-left">Toutes</span>
              <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded bg-foreground/[0.04] border border-border/60 text-muted-foreground">
                {logs.length}
              </span>
            </button>
            {sources.map((s) => {
              const selected = sourceFilter === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    onSourceFilterChange(selected ? null : s.id)
                  }
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition hover:bg-foreground/[0.03]"
                  style={{
                    background: selected ? "oklch(1 0 0 / 0.04)" : "transparent",
                  }}
                  aria-pressed={selected}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: sourceColor(s.id) }}
                  />
                  <span
                    className={`font-mono text-[11px] flex-1 text-left truncate ${selected ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {s.id}
                  </span>
                  <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded bg-foreground/[0.04] border border-border/60 text-muted-foreground">
                    {s.count}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <SectionTitle>Résumé</SectionTitle>
      <div className="px-2 space-y-1.5">
        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-foreground/[0.03]">
          <span className="text-[12px] text-muted-foreground">Total</span>
          <span className="text-[12px] font-medium font-mono">
            {logs.length}
          </span>
        </div>
        {counts.error > 0 && (
          <div
            className="flex items-center justify-between px-2.5 py-1.5 rounded-md"
            style={{ background: "oklch(0.7 0.2 25 / 0.08)" }}
          >
            <span
              className="text-[12px]"
              style={{ color: "oklch(0.7 0.2 25)" }}
            >
              Erreurs
            </span>
            <span
              className="text-[12px] font-medium font-mono"
              style={{ color: "oklch(0.8 0.2 25)" }}
            >
              {counts.error}
            </span>
          </div>
        )}
        {counts.warn > 0 && (
          <div
            className="flex items-center justify-between px-2.5 py-1.5 rounded-md"
            style={{ background: "oklch(0.78 0.14 75 / 0.08)" }}
          >
            <span
              className="text-[12px]"
              style={{ color: "oklch(0.78 0.14 75)" }}
            >
              Avertissements
            </span>
            <span
              className="text-[12px] font-medium font-mono"
              style={{ color: "oklch(0.85 0.14 75)" }}
            >
              {counts.warn}
            </span>
          </div>
        )}
      </div>

    </div>
  );
}
