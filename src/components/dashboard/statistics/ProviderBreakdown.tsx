import { useTranslation } from "react-i18next";
import type { ProviderSlice } from "@/hooks/useStatistics";
import { formatDurationCompact } from "@/hooks/useStatistics";

interface ProviderBreakdownProps {
  providers: ProviderSlice[];
  total: number;
}

const PROVIDER_COLOR: Record<string, string> = {
  openai: "var(--vt-green)",
  groq: "var(--vt-warn)",
  google: "var(--vt-cyan)",
  local: "var(--vt-violet)",
};

function colorFor(key: string): string {
  return PROVIDER_COLOR[key] ?? "var(--vt-fg-4)";
}

export function ProviderBreakdown({ providers, total }: ProviderBreakdownProps) {
  const { t, i18n } = useTranslation();
  const numberLocale = i18n.language === "en" ? "en-US" : "fr-FR";

  if (total === 0) {
    return (
      <div className="vt-card-elevated p-5">
        <h3 className="text-[14px] font-semibold text-[var(--vt-fg)]">
          {t("statistics.providersTitle")}
        </h3>
        <p className="text-[12px] text-[var(--vt-fg-3)] mt-3">
          {t("statistics.providersEmpty")}
        </p>
      </div>
    );
  }

  return (
    <div className="vt-card-elevated p-5">
      <h3 className="vt-display text-[14px] font-semibold text-[var(--vt-fg)]">
        {t("statistics.providersTitle")}
      </h3>
      <p className="text-[12px] text-[var(--vt-fg-3)] mt-0.5 mb-4">
        {t("statistics.providersSubtitle")}
      </p>

      {/* Stacked bar */}
      <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-[var(--vt-hover)]">
        {providers.map((p) => {
          const w = (p.count / total) * 100;
          if (w < 0.5) return null;
          return (
            <div
              key={p.key}
              style={{ width: `${w}%`, background: colorFor(p.key) }}
              title={`${p.label} · ${p.count}`}
            />
          );
        })}
      </div>

      <div className="mt-4 space-y-2">
        {providers.map((p) => {
          const pct = (p.count / total) * 100;
          return (
            <div
              key={p.key}
              className="flex items-center gap-3 px-3 py-2 rounded-md vt-hover-bg"
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: colorFor(p.key) }}
              />
              <span className="text-[13px] font-medium text-[var(--vt-fg)] flex-1 min-w-0 truncate">
                {p.label}
              </span>
              <span className="text-[11px] text-[var(--vt-fg-3)] vt-mono">
                {formatDurationCompact(p.totalDurationSec)}
              </span>
              <span className="text-[12px] font-semibold vt-mono text-[var(--vt-fg)] tabular-nums w-[64px] text-right">
                {p.count.toLocaleString(numberLocale)}
              </span>
              <span className="text-[11px] text-[var(--vt-fg-3)] vt-mono tabular-nums w-[44px] text-right">
                {pct.toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
