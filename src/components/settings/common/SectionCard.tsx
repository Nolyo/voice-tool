import type { ReactNode } from "react";

interface SectionCardProps {
  id?: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
  iconBg?: string;
}

export function SectionCard({
  id,
  icon,
  title,
  subtitle,
  children,
  iconBg = "bg-primary/10",
}: SectionCardProps) {
  return (
    <div id={id} className="space-y-3 scroll-mt-2 bg-black/30 p-3 rounded-lg">
      <div className="flex items-center gap-3 px-0.5 bg-black/40 py-3 rounded-lg px-2">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}
        >
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground leading-tight">
            {title}
          </h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        {children}
      </div>
    </div>
  );
}
