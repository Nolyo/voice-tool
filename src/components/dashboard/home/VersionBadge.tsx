import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolveChannel } from "@/lib/version-channel";

interface VersionBadgeProps {
  /** Opens Settings → About, where the full version and the updater live. */
  onOpenAboutPage: () => void;
}

/**
 * Installed version and its channel, in the home screen's eyebrow row.
 *
 * The channel comes from the version string itself, not from the
 * `update_channel` setting: this answers "what am I running?", and the number
 * displayed right next to it is the proof. Renders nothing until the version
 * resolves — and nothing at all if it fails, since Settings → About already
 * owns the loud error path for that exact failure.
 */
export function VersionBadge({ onOpenAboutPage }: VersionBadgeProps) {
  const { t } = useTranslation();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const v = await getVersion();
        if (!cancelled) setVersion(v);
      } catch (err) {
        console.error("Failed to get app version:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!version) return null;

  const channel = resolveChannel(version);
  const channelLabel =
    channel === "beta"
      ? t("home.version.channelBeta")
      : t("home.version.channelStable");
  const label = t("home.version.openAbout", {
    version,
    channel: channelLabel,
  });

  return (
    <button
      type="button"
      onClick={onOpenAboutPage}
      title={label}
      aria-label={label}
      className="flex items-center gap-1.5 shrink-0 rounded px-1 py-0.5 transition-opacity hover:opacity-75"
    >
      <span className="vt-mono text-[10.5px] tracking-normal text-[var(--vt-fg-4)]">
        v{version}
      </span>
      <span
        className="text-[9.5px] font-semibold uppercase tracking-[0.1em] rounded px-1.5 py-0.5"
        style={
          channel === "beta"
            ? {
                background:
                  "color-mix(in oklab, var(--vt-warn) 18%, transparent)",
                color: "var(--vt-warn)",
              }
            : { background: "var(--vt-surface-hi)", color: "var(--vt-fg-3)" }
        }
      >
        {channelLabel}
      </span>
    </button>
  );
}
