import type { ReactNode } from "react";

interface SectionLabelProps {
  children: ReactNode;
  /** Optional trailing element (e.g. a "view all" link) pinned to the right. */
  action?: ReactNode;
}

/**
 * Small uppercase section label with a hairline rule that fills the row — the
 * recurring divider between home-screen sections (Dictate / Recent notes /
 * Quick actions).
 */
export function SectionLabel({ children, action }: SectionLabelProps) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--vt-fg-4)] whitespace-nowrap">
        {children}
      </span>
      <span className="h-px flex-1 bg-[var(--vt-border)]" aria-hidden="true" />
      {action}
    </div>
  );
}
