import { useTranslation } from "react-i18next";
import { CheckCircle2, RefreshCw, WifiOff, AlertTriangle } from "lucide-react";
import { useSync } from "@/hooks/useSync";
import { useAuth } from "@/hooks/useAuth";
import type { SyncStatus } from "@/lib/sync/types";

const TOOLTIP_KEY: Record<SyncStatus, string> = {
  disabled: "",
  idle: "sync.status.idle",
  syncing: "sync.status.syncing",
  offline: "sync.status.offline",
  error: "sync.status.error",
};

export function SyncStatusIndicator() {
  const { t } = useTranslation();
  const auth = useAuth();
  const sync = useSync();

  if (auth.status !== "signed-in") return null;
  if (!sync.enabled) return null;
  if (sync.status === "disabled") return null;

  const tip =
    sync.status === "offline"
      ? t(TOOLTIP_KEY[sync.status], { count: sync.pending_count })
      : t(TOOLTIP_KEY[sync.status]);

  let icon;
  let colorClass = "text-muted-foreground";
  switch (sync.status) {
    case "idle":
      icon = <CheckCircle2 className="w-4 h-4" />;
      colorClass = "text-emerald-500";
      break;
    case "syncing":
      icon = <RefreshCw className="w-4 h-4 animate-spin" />;
      colorClass = "text-primary";
      break;
    case "offline":
      icon = <WifiOff className="w-4 h-4" />;
      colorClass = "text-amber-500";
      break;
    case "error":
      icon = <AlertTriangle className="w-4 h-4" />;
      colorClass = "text-destructive";
      break;
  }

  return (
    <button
      type="button"
      onClick={() => void sync.syncNow()}
      title={tip}
      aria-label={tip}
      className={`inline-flex items-center justify-center rounded-md w-9 h-9 hover:bg-accent transition-colors ${colorClass}`}
    >
      {icon}
    </button>
  );
}
