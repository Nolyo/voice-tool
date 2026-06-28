import { useTranslation } from "react-i18next";
import { useProfiles } from "@/contexts/ProfilesContext";
import { useAuth } from "@/hooks/useAuth";
import { useSync } from "@/hooks/useSync";
import { useDateFormatters } from "@/lib/date-format";

/**
 * Time-aware greeting at the top of the home screen. We have no first name
 * (Supabase Auth only exposes the email), so the personal touch is the active
 * profile's name — always present, user-chosen. The tagline surfaces the last
 * sync time when sync is on, otherwise a neutral "ready to dictate".
 */
export function GreetingHeader() {
  const { t } = useTranslation();
  const { profiles, activeProfileId } = useProfiles();
  const { status } = useAuth();
  const { enabled: syncEnabled, last_sync_at } = useSync();
  const { formatRelative } = useDateFormatters();

  const hour = new Date().getHours();
  const hello =
    hour >= 5 && hour < 18
      ? t("home.greeting.morning")
      : t("home.greeting.evening");

  const name = profiles.find((p) => p.id === activeProfileId)?.name?.trim();

  const tagline =
    status === "signed-in" && syncEnabled && last_sync_at
      ? t("home.greeting.taglineSynced", {
          when: formatRelative(new Date(last_sync_at)),
        })
      : t("home.greeting.taglineDefault");

  return (
    <div className="vt-anim-fade-up">
      <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--vt-fg-4)]">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--vt-accent)] vt-anim-pulse-dot" />
        {t("home.heroEyebrow")}
      </div>
      <h1 className="vt-display text-[26px] leading-[1.08] font-semibold tracking-tight text-[var(--vt-fg)] mt-1.5">
        {name ? (
          <>
            {hello}, <span className="text-[var(--vt-accent)]">{name}</span>.
          </>
        ) : (
          <>{hello}.</>
        )}
      </h1>
      <p className="text-[13.5px] text-[var(--vt-fg-3)] mt-1.5">{tagline}</p>
    </div>
  );
}
