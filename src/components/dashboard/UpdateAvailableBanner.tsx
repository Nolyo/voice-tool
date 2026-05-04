import { ChevronRight, Download } from "lucide-react";
import { useTranslation } from "react-i18next";

interface UpdateAvailableBannerProps {
  collapsed: boolean;
  version: string;
  onClick: () => void;
}

export function UpdateAvailableBanner({
  collapsed,
  version,
  onClick,
}: UpdateAvailableBannerProps) {
  const { t } = useTranslation();
  const tooltip = t("sidebar.updateAvailableTooltip", { version });

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={tooltip}
        aria-label={tooltip}
        className="relative flex items-center justify-center p-1.5 rounded-md transition-colors cursor-pointer hover:opacity-90"
        style={{ background: "var(--vt-accent-soft)" }}
      >
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
          style={{ background: "var(--vt-accent-soft)" }}
        >
          <Download className="w-3.5 h-3.5" style={{ color: "var(--vt-accent)" }} />
        </div>
        <span
          className="absolute top-1 right-1 w-2 h-2 rounded-full animate-pulse"
          style={{ background: "var(--vt-accent)" }}
          aria-hidden="true"
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={tooltip}
      className="w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors cursor-pointer hover:opacity-90"
      style={{ background: "var(--vt-accent-soft)" }}
    >
      <div
        className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
        style={{ background: "var(--vt-accent-soft)" }}
      >
        <Download className="w-3.5 h-3.5" style={{ color: "var(--vt-accent)" }} />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div
          className="text-sm font-medium truncate"
          style={{ color: "var(--vt-fg)" }}
        >
          {t("sidebar.updateAvailable")}
        </div>
        <div
          className="text-[11px] truncate vt-mono"
          style={{ color: "var(--vt-fg-3)" }}
        >
          {version}
        </div>
      </div>
      <ChevronRight
        className="w-3.5 h-3.5 shrink-0"
        style={{ color: "var(--vt-fg-3)" }}
        aria-hidden="true"
      />
    </button>
  );
}
