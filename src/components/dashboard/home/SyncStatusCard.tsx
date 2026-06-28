import type { ReactNode } from "react";
import { ArrowRight, Cloud, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useSync } from "@/hooks/useSync";
import { useProfiles } from "@/contexts/ProfilesContext";
import { useDateFormatters } from "@/lib/date-format";

interface SyncStatusCardProps {
  notesCount: number;
  onOpenAccountPage: () => void;
}

/**
 * Sync card for the home bento. Three states: signed-out (sign-in CTA),
 * signed-in but sync disabled for this profile (activation CTA), and sync
 * enabled (live status dot + profile / notes / pending fields). Clicking the
 * active card triggers a manual sync.
 */
export function SyncStatusCard({
  notesCount,
  onOpenAccountPage,
}: SyncStatusCardProps) {
  const { t } = useTranslation();
  const { status, openAuthModal } = useAuth();
  const sync = useSync();
  const { profiles, activeProfileId } = useProfiles();
  const { formatRelative } = useDateFormatters();

  const profileName =
    profiles.find((p) => p.id === activeProfileId)?.name ?? t("profile.label");

  // --- Signed-out ----------------------------------------------------------
  if (status !== "signed-in") {
    return (
      <Card>
        <Top
          icon={<Cloud className="w-[17px] h-[17px]" />}
          title={t("home.syncCard.signedOutTitle")}
          subtitle={t("home.syncCard.signedOutDesc")}
        />
        <Button
          className="mt-auto"
          size="sm"
          variant="outline"
          onClick={openAuthModal}
        >
          {t("home.syncCard.signIn")}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </Card>
    );
  }

  // --- Signed-in, sync disabled on this profile ---------------------------
  if (!sync.enabled) {
    return (
      <Card>
        <Top
          icon={<RefreshCw className="w-[17px] h-[17px]" />}
          title={t("home.sync.title")}
          subtitle={t("home.sync.desc")}
        />
        <Button
          className="mt-auto"
          size="sm"
          variant="outline"
          onClick={onOpenAccountPage}
        >
          {t("home.sync.cta")}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </Card>
    );
  }

  // --- Sync enabled: live status ------------------------------------------
  const state = describeState();

  return (
    <button
      type="button"
      onClick={() => void sync.syncNow()}
      title={t("home.syncCard.syncNow")}
      className="vt-card-elevated p-[18px] flex flex-col gap-3 text-left cursor-pointer hover:bg-[var(--vt-surface)] transition-colors"
    >
      <div className="flex items-center gap-3">
        <span className="flex items-center justify-center w-[34px] h-[34px] rounded-[10px] shrink-0 text-[var(--vt-accent)] bg-[var(--vt-accent-soft)]">
          <Cloud className="w-[17px] h-[17px]" />
        </span>
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-[var(--vt-fg)]">
            {t("home.syncCard.title")}
          </div>
          <div
            className="text-[11.5px] mt-0.5 inline-flex items-center gap-1.5"
            style={{ color: state.color }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: "currentColor" }}
            />
            {state.label}
            {sync.last_sync_at && sync.status === "idle" && (
              <span className="text-[var(--vt-fg-4)]">
                · {formatRelative(new Date(sync.last_sync_at))}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-5">
        <Field label={t("home.syncCard.fieldProfile")} value={profileName} />
        <Field label={t("home.syncCard.fieldNotes")} value={String(notesCount)} />
        <Field
          label={t("home.syncCard.fieldPending")}
          value={
            sync.pending_count > 0
              ? String(sync.pending_count)
              : t("home.syncCard.allSynced")
          }
        />
      </div>
    </button>
  );

  function describeState(): { label: string; color: string } {
    switch (sync.status) {
      case "syncing":
        return { label: t("home.syncCard.syncing"), color: "var(--vt-accent)" };
      case "offline":
        return { label: t("home.syncCard.offline"), color: "var(--vt-warn)" };
      case "error":
        return { label: t("home.syncCard.error"), color: "var(--vt-danger)" };
      case "quota-exceeded":
        return {
          label: t("home.syncCard.quotaExceeded"),
          color: "var(--vt-warn)",
        };
      default:
        return { label: t("home.syncCard.upToDate"), color: "var(--vt-green)" };
    }
  }
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="vt-card-elevated p-[18px] flex flex-col gap-3 h-full">
      {children}
    </div>
  );
}

function Top({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex items-center justify-center w-[34px] h-[34px] rounded-[10px] shrink-0 text-[var(--vt-accent)] bg-[var(--vt-accent-soft)]">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold text-[var(--vt-fg)]">
          {title}
        </div>
        <p className="text-[12px] text-[var(--vt-fg-3)] mt-0.5 leading-snug">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9.5px] uppercase tracking-[0.1em] font-semibold text-[var(--vt-fg-4)]">
        {label}
      </div>
      <div className="vt-mono text-[12.5px] text-[var(--vt-fg)] mt-0.5 truncate">
        {value}
      </div>
    </div>
  );
}
