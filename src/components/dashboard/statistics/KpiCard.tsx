import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  accent?: "default" | "violet" | "amber" | "emerald" | "rose";
}

const ACCENT_TINT: Record<NonNullable<KpiCardProps["accent"]>, string> = {
  default: "oklch(0.7 0.17 264)",
  violet: "oklch(0.72 0.18 295)",
  amber: "oklch(0.78 0.14 75)",
  emerald: "oklch(0.74 0.14 150)",
  rose: "oklch(0.73 0.18 15)",
};

export function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  accent = "default",
}: KpiCardProps) {
  const tint = ACCENT_TINT[accent];

  return (
    <div
      className="vt-card-elevated relative overflow-hidden p-5"
      style={{
        background: `
          radial-gradient(circle at 100% 0%, ${tint.replace(")", " / 0.18)")} 0, transparent 55%),
          var(--vt-panel-2)
        `,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--vt-fg-3)]">
          {label}
        </span>
        <div
          className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
          style={{
            background: tint.replace(")", " / 0.14)"),
            color: tint,
          }}
        >
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="mt-3 text-[28px] leading-none font-semibold tracking-tight text-[var(--vt-fg)] vt-mono">
        {value}
      </div>
      {hint && (
        <div className="mt-2 text-[12px] text-[var(--vt-fg-3)]">{hint}</div>
      )}
    </div>
  );
}
