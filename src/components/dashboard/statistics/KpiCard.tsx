import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  accent?: "default" | "violet" | "amber" | "emerald" | "rose";
}

const ACCENT_TINT: Record<NonNullable<KpiCardProps["accent"]>, string> = {
  default: "var(--vt-accent)",
  violet: "var(--vt-violet)",
  amber: "var(--vt-warn)",
  emerald: "var(--vt-green)",
  rose: "var(--vt-pin)",
};

export function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  accent = "default",
}: KpiCardProps) {
  const tint = ACCENT_TINT[accent];
  const tintSoft = `oklch(from ${tint} l c h / 0.18)`;
  const tintBg = `oklch(from ${tint} l c h / 0.14)`;

  return (
    <div
      className="vt-card-elevated relative overflow-hidden p-5"
      style={{
        background: `
          radial-gradient(circle at 100% 0%, ${tintSoft} 0, transparent 55%),
          var(--vt-panel-2)
        `,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="vt-eyebrow">
          {label}
        </span>
        <div
          className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
          style={{
            background: tintBg,
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
