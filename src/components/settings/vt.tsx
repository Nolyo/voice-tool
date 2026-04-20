import type { CSSProperties, FormEvent, ReactNode } from "react";

/* ─── Icons (inline SVG, match design exactly) ─────────────────────── */

type IconProps = { className?: string; style?: CSSProperties; title?: string };

export const VtIcon = {
  mic: (p: IconProps) => (
    <svg {...p} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  ),
  refresh: (p: IconProps) => (
    <svg {...p} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 0-15-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 15 6.7l3-2.7" />
      <path d="M21 21v-5h-5" />
    </svg>
  ),
  play: (p: IconProps) => (
    <svg {...p} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="7 4 20 12 7 20 7 4" />
    </svg>
  ),
  stop: (p: IconProps) => (
    <svg {...p} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  ),
  check: (p: IconProps) => (
    <svg {...p} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  info: (p: IconProps) => (
    <svg {...p} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  ),
  alert: (p: IconProps) => (
    <svg {...p} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  ),
  clock: (p: IconProps) => (
    <svg {...p} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  wand: (p: IconProps) => (
    <svg {...p} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 4-3 3L4 15l3 3 8-8 3-3-3-3Z" />
      <path d="M18 12v4M20 14h-4M6 2v4M8 4H4" />
    </svg>
  ),
  plug: (p: IconProps) => (
    <svg {...p} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2v6M15 2v6" />
      <path d="M12 17.5V22" />
      <path d="M5 8h14v3a7 7 0 0 1-14 0V8Z" />
    </svg>
  ),
  sparkle: (p: IconProps) => (
    <svg {...p} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2 14 10 22 12 14 14 12 22 10 14 2 12 10 10 12 2Z" />
    </svg>
  ),
  clipboard: (p: IconProps) => (
    <svg {...p} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  ),
  close: (p: IconProps) => (
    <svg {...p} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  plus: (p: IconProps) => (
    <svg {...p} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  minus: (p: IconProps) => (
    <svg {...p} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  trash: (p: IconProps) => (
    <svg {...p} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
    </svg>
  ),
  centerTarget: (p: IconProps) => (
    <svg {...p} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  ),
  spinner: (p: IconProps) => (
    <svg {...p} className={(p.className ?? "") + " animate-spin"} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.22-8.56" />
    </svg>
  ),
  dark: (p: IconProps) => (
    <svg {...p} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ),
  light: (p: IconProps) => (
    <svg {...p} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  ),
};

/* ─── Row primitive ───────────────────────────────────────────────── */

interface RowProps {
  label: ReactNode;
  hint?: ReactNode;
  help?: string;
  align?: "start" | "center";
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Row({
  label,
  hint,
  help,
  align = "center",
  children,
  className,
  style,
}: RowProps) {
  const alignCls = align === "start" ? "items-start" : "items-center";
  return (
    <div
      className={`vt-row grid gap-4 ${alignCls} ${className ?? ""}`}
      style={{ gridTemplateColumns: "minmax(180px, 280px) 1fr", ...style }}
    >
      <div className="flex flex-col gap-1 pt-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium" style={{ color: "var(--vt-fg)" }}>
            {label}
          </span>
          {help && (
            <span data-tip={help} className="cursor-help" style={{ color: "var(--vt-fg-4)" }}>
              <VtIcon.info />
            </span>
          )}
        </div>
        {hint && (
          <span className="text-[12px] leading-snug" style={{ color: "var(--vt-fg-3)" }}>
            {hint}
          </span>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ─── Section header ──────────────────────────────────────────────── */

interface SectionHeaderProps {
  color: string;
  icon: ReactNode;
  title: ReactNode;
  description: ReactNode;
  trailing?: ReactNode;
}

export function SectionHeader({ color, icon, title, description, trailing }: SectionHeaderProps) {
  return (
    <div
      className="flex items-start gap-3 px-5 py-4"
      style={{ borderBottom: "1px solid var(--vt-border)" }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{
          background: `oklch(from ${color} l c h / 0.15)`,
          color,
          boxShadow: `inset 0 0 0 1px oklch(from ${color} l c h / 0.3)`,
        }}
      >
        {icon}
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold tracking-tight leading-tight">{title}</h2>
        <p className="text-[12.5px] mt-0.5" style={{ color: "var(--vt-fg-3)" }}>
          {description}
        </p>
      </div>
      {trailing}
    </div>
  );
}

/* ─── Callout ────────────────────────────────────────────────────── */

type CalloutKind = "info" | "warn" | "ok" | "danger";

interface CalloutProps {
  kind?: CalloutKind;
  icon?: ReactNode;
  title?: ReactNode;
  children: ReactNode;
}

export function Callout({ kind = "info", icon, title, children }: CalloutProps) {
  const styles = {
    info: {
      bg: "oklch(from var(--vt-accent) l c h / 0.07)",
      bd: "oklch(from var(--vt-accent) l c h / 0.22)",
      fg: "var(--vt-accent-2)",
    },
    warn: {
      bg: "var(--vt-warn-soft)",
      bd: "oklch(from var(--vt-warn) l c h / 0.3)",
      fg: "var(--vt-warn)",
    },
    ok: {
      bg: "var(--vt-ok-soft)",
      bd: "oklch(from var(--vt-ok) l c h / 0.3)",
      fg: "var(--vt-ok)",
    },
    danger: {
      bg: "oklch(from var(--vt-danger) l c h / 0.08)",
      bd: "oklch(from var(--vt-danger) l c h / 0.3)",
      fg: "var(--vt-danger)",
    },
  }[kind];

  return (
    <div
      className="flex items-start gap-3 rounded-xl px-3.5 py-3"
      style={{ background: styles.bg, border: `1px solid ${styles.bd}` }}
    >
      <div
        className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: "oklch(from currentColor l c h / 0.16)", color: styles.fg }}
      >
        {icon || <VtIcon.info />}
      </div>
      <div className="flex flex-col min-w-0">
        {title && (
          <div className="text-[13px] font-semibold" style={{ color: styles.fg }}>
            {title}
          </div>
        )}
        <div className="text-[12.5px] leading-snug" style={{ color: "var(--vt-fg-2)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ─── Toggle ─────────────────────────────────────────────────────── */

interface ToggleProps {
  on: boolean;
  onClick: () => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}

export function Toggle({ on, onClick, label, hint, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="flex items-start gap-3 text-left"
      style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
    >
      <span className="vt-toggle mt-0.5" data-on={on} />
      <span className="flex flex-col">
        <span className="text-[13.5px]" style={{ color: "var(--vt-fg)" }}>
          {label}
        </span>
        {hint && (
          <span className="text-[12px] mt-0.5" style={{ color: "var(--vt-fg-3)" }}>
            {hint}
          </span>
        )}
      </span>
    </button>
  );
}

/* ─── Segmented control (mini pill group) ─────────────────────────── */

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: ReactNode; icon?: ReactNode }[];
}

export function Segmented<T extends string>({ value, onChange, options }: SegmentedProps<T>) {
  return (
    <div
      className="inline-flex rounded-lg p-1"
      style={{ background: "var(--vt-surface)", border: "1px solid var(--vt-border)" }}
    >
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className="h-7 px-3 rounded-md text-[12px] font-medium transition flex items-center gap-1.5"
            style={
              active
                ? {
                    background: "oklch(from var(--vt-accent) l c h / 0.2)",
                    color: "var(--vt-accent-2)",
                  }
                : { color: "var(--vt-fg-3)" }
            }
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Radio card list (used for mode selectors) ───────────────────── */

interface RadioCardOption<T extends string> {
  id: T;
  title: ReactNode;
  sub?: ReactNode;
  badge?: ReactNode;
}

interface RadioCardListProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: RadioCardOption<T>[];
}

export function RadioCardList<T extends string>({ value, onChange, options }: RadioCardListProps<T>) {
  return (
    <div className="space-y-2">
      {options.map((m) => {
        const active = value === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            className="w-full flex items-start gap-3 p-3 rounded-lg text-left transition"
            style={{
              background: active
                ? "oklch(from var(--vt-accent) l c h / 0.08)"
                : "var(--vt-surface)",
              border:
                "1px solid " +
                (active
                  ? "oklch(from var(--vt-accent) l c h / 0.4)"
                  : "var(--vt-border)"),
            }}
          >
            <span
              className="mt-1 w-3.5 h-3.5 rounded-full flex items-center justify-center"
              style={{
                border:
                  "1.5px solid " + (active ? "var(--vt-accent)" : "var(--vt-border-strong)"),
              }}
            >
              {active && (
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: "var(--vt-accent)" }}
                />
              )}
            </span>
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium">{m.title}</span>
                {m.badge && (
                  <span
                    className="vt-mono text-[10px] px-1.5 py-0.5 rounded"
                    style={{
                      background: "oklch(from var(--vt-accent) l c h / 0.18)",
                      color: "var(--vt-accent-2)",
                    }}
                  >
                    {m.badge}
                  </span>
                )}
              </div>
              {m.sub && (
                <span className="text-[12px]" style={{ color: "var(--vt-fg-3)" }}>
                  {m.sub}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Card-row button group (used for provider selection) ─────────── */

interface PickerCardOption<T extends string> {
  id: T;
  title: ReactNode;
  sub?: ReactNode;
  dot?: string;
}

interface PickerCardGridProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: PickerCardOption<T>[];
  columns?: number;
}

export function PickerCardGrid<T extends string>({
  value,
  onChange,
  options,
  columns = 3,
}: PickerCardGridProps<T>) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map((p) => {
        const active = value === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            className="flex items-center gap-3 px-3 h-14 rounded-lg text-left transition"
            style={{
              background: active
                ? "oklch(from var(--vt-accent) l c h / 0.12)"
                : "var(--vt-surface)",
              border:
                "1px solid " +
                (active
                  ? "oklch(from var(--vt-accent) l c h / 0.4)"
                  : "var(--vt-border)"),
            }}
          >
            {p.dot && (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: p.dot, boxShadow: `0 0 8px ${p.dot}` }}
              />
            )}
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-[13px] font-medium">{p.title}</span>
              {p.sub && (
                <span className="text-[11px] vt-mono" style={{ color: "var(--vt-fg-3)" }}>
                  {p.sub}
                </span>
              )}
            </div>
            {active && (
              <span className="ml-auto" style={{ color: "var(--vt-accent-2)" }}>
                <VtIcon.check />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Kbd (styled key badge) ──────────────────────────────────────── */

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className="vt-mono inline-flex items-center justify-center h-6 min-w-[24px] px-1.5 rounded-md text-[11px] font-semibold"
      style={{
        background: "var(--vt-surface-hi)",
        border: "1px solid var(--vt-border-strong)",
        boxShadow: "0 1px 0 rgba(0,0,0,.3), inset 0 1px 0 oklch(1 0 0 / 0.05)",
        color: "var(--vt-fg)",
      }}
    >
      {children}
    </kbd>
  );
}

/* ─── Form helpers ────────────────────────────────────────────────── */

export function stopPropagation(e: FormEvent) {
  e.stopPropagation();
}
