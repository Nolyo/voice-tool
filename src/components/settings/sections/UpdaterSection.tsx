import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdaterContext } from "@/contexts/UpdaterContext";
import { useSettings } from "@/hooks/useSettings";
import {
  Callout,
  PickerCardGrid,
  Row,
  SectionHeader,
  Toggle,
  VtIcon,
} from "../vt";

const ACCENT = "oklch(0.72 0.16 130)";

type Channel = "stable" | "beta";

export function UpdaterSection() {
  const { t, i18n } = useTranslation();
  const {
    isChecking,
    updateInfo,
    isDownloading,
    downloadProgress,
    error,
    checkForUpdates,
    downloadAndInstall,
    updaterAvailable,
    checkUpdaterAvailability,
  } = useUpdaterContext();
  const { settings, updateSetting } = useSettings();
  const [currentVersion, setCurrentVersion] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const version = await getVersion();
        if (!cancelled) setCurrentVersion(version);
      } catch (err) {
        console.error("Failed to get app version:", err);
      }
    })();
    checkUpdaterAvailability();
    return () => {
      cancelled = true;
    };
  }, [checkUpdaterAvailability]);

  const locale = i18n.language === "en" ? "en-US" : "fr-FR";

  const sectionIcon = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="8 17 12 21 16 17" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29" />
    </svg>
  );

  const disabled = updaterAvailable === false;
  const autoCheck = settings.auto_check_updates ?? true;
  const hasUpdate = !!updateInfo?.available;

  return (
    <div className="vt-fade-up space-y-5">
      <div className="vt-card-sectioned" style={{ overflow: "hidden" }}>
        <SectionHeader
          color={ACCENT}
          icon={sectionIcon}
          title={t("settings.updater.title")}
          description={t("settings.updater.subtitle")}
        />

        {/* Status / check */}
        <div className="vt-row">
          {disabled ? (
            <div
              className="rounded-xl p-4 flex items-center gap-4"
              style={{
                background: "var(--vt-surface)",
                border: "1px solid var(--vt-border)",
              }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  background: "var(--vt-surface-hi)",
                  color: "var(--vt-fg-3)",
                }}
              >
                <VtIcon.alert />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold">
                    {t("updater.unavailableTitle")}
                  </span>
                  {currentVersion && (
                    <span
                      className="vt-mono text-[11px] px-1.5 py-0.5 rounded"
                      style={{
                        background: "var(--vt-surface-hi)",
                        color: "var(--vt-fg-3)",
                      }}
                    >
                      v{currentVersion}
                    </span>
                  )}
                </div>
                <div className="text-[12px]" style={{ color: "var(--vt-fg-3)" }}>
                  {t("updater.unavailableDesc")}
                </div>
              </div>
            </div>
          ) : hasUpdate ? (
            <div
              className="rounded-xl p-4 flex items-center gap-4"
              style={{
                background: "oklch(from var(--vt-accent) l c h / 0.08)",
                border: "1px solid oklch(from var(--vt-accent) l c h / 0.25)",
              }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  background: "oklch(from var(--vt-accent) l c h / 0.18)",
                  color: "var(--vt-accent-2)",
                }}
              >
                <VtIcon.refresh />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold">
                    {t("updater.newVersionTitle")}
                  </span>
                  <span
                    className="vt-mono text-[11px] px-1.5 py-0.5 rounded"
                    style={{
                      background: "oklch(from var(--vt-accent) l c h / 0.18)",
                      color: "var(--vt-accent-2)",
                    }}
                  >
                    v{updateInfo?.version}
                  </span>
                </div>
                {updateInfo?.date && (
                  <div className="text-[12px]" style={{ color: "var(--vt-fg-3)" }}>
                    {t("updater.publishedOn")}{" "}
                    {new Date(updateInfo.date).toLocaleDateString(locale, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={downloadAndInstall}
                disabled={isDownloading}
                className="vt-btn-primary"
              >
                {isDownloading ? (
                  <>
                    <VtIcon.spinner />
                    {downloadProgress?.percentage ?? 0}%
                  </>
                ) : (
                  <>
                    <VtIcon.refresh />
                    {t("updater.install")}
                  </>
                )}
              </button>
            </div>
          ) : (
            <div
              className="rounded-xl p-4 flex items-center gap-4"
              style={{
                background: "oklch(from var(--vt-accent) l c h / 0.08)",
                border: "1px solid oklch(from var(--vt-accent) l c h / 0.25)",
              }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  background: "oklch(from var(--vt-accent) l c h / 0.18)",
                  color: "var(--vt-accent-2)",
                }}
              >
                <VtIcon.check />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold">
                    {t("updater.upToDate")}
                  </span>
                  {currentVersion && (
                    <span
                      className="vt-mono text-[11px] px-1.5 py-0.5 rounded"
                      style={{
                        background: "oklch(from var(--vt-accent) l c h / 0.18)",
                        color: "var(--vt-accent-2)",
                      }}
                    >
                      v{currentVersion}
                    </span>
                  )}
                </div>
                <div className="text-[12px]" style={{ color: "var(--vt-fg-3)" }}>
                  {t("updater.installedVersion")}
                </div>
              </div>
              <button
                type="button"
                onClick={checkForUpdates}
                disabled={isChecking || isDownloading}
                className="vt-btn"
              >
                {isChecking ? (
                  <>
                    <VtIcon.spinner />
                    {t("updater.checking")}
                  </>
                ) : (
                  <>
                    <VtIcon.refresh />
                    {t("updater.checkUpdates")}
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Release notes when an update is pending */}
        {hasUpdate && updateInfo?.body && (
          <Row
            label={t("updater.releaseNotes")}
            hint={t("updater.releaseNotesHint", {
              defaultValue: "Nouveautés incluses dans cette version.",
            })}
            align="start"
          >
            <div
              className="rounded-lg p-3 text-[12.5px] whitespace-pre-wrap max-h-60 overflow-y-auto"
              style={{
                background: "var(--vt-surface)",
                border: "1px solid var(--vt-border)",
                color: "var(--vt-fg-2)",
              }}
            >
              {updateInfo.body}
            </div>
          </Row>
        )}

        {/* Download progress */}
        {isDownloading && downloadProgress && (
          <div className="vt-row">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[12px]">
                <span style={{ color: "var(--vt-fg-3)" }}>
                  {t("updater.downloading")}
                </span>
                <span
                  className="vt-mono font-bold"
                  style={{ color: "var(--vt-accent-2)" }}
                >
                  {downloadProgress.percentage}%
                </span>
              </div>
              <div
                className="w-full h-1.5 rounded-full overflow-hidden"
                style={{ background: "var(--vt-surface)" }}
              >
                <div
                  className="h-full"
                  style={{
                    width: `${downloadProgress.percentage}%`,
                    background: "var(--vt-accent)",
                    transition: "width .2s",
                  }}
                />
              </div>
              {downloadProgress.total && (
                <p
                  className="text-[11px] vt-mono text-center"
                  style={{ color: "var(--vt-fg-4)" }}
                >
                  {(downloadProgress.downloaded / 1024 / 1024).toFixed(1)} MB /{" "}
                  {(downloadProgress.total / 1024 / 1024).toFixed(1)} MB
                </p>
              )}
            </div>
          </div>
        )}

        {/* Channel */}
        <Row
          label={t("updater.updateChannel")}
          hint={t("updater.channelHelp")}
        >
          <PickerCardGrid<Channel>
            value={(settings.update_channel ?? "stable") as Channel}
            onChange={(v) => updateSetting("update_channel", v)}
            options={[
              {
                id: "stable",
                title: t("updater.channelStable"),
                sub: t("updater.channelStableSub", {
                  defaultValue: "Recommandé pour un usage quotidien",
                }),
              },
              {
                id: "beta",
                title: t("updater.channelBeta"),
                sub: t("updater.channelBetaSub", {
                  defaultValue: "Dernières fonctionnalités en test",
                }),
              },
            ]}
            columns={2}
          />
        </Row>

        {/* Auto-check */}
        <Row
          label={t("updater.autoCheck")}
          hint={t("updater.autoCheckDesc")}
        >
          <Toggle
            on={autoCheck}
            onClick={() => updateSetting("auto_check_updates", !autoCheck)}
            label={
              autoCheck
                ? t("common.enabled", { defaultValue: "Activé" })
                : t("common.disabled", { defaultValue: "Désactivé" })
            }
          />
        </Row>
      </div>

      {error && (
        <Callout
          kind="danger"
          icon={<VtIcon.alert />}
          title={t("updater.checkError")}
        >
          {error}
        </Callout>
      )}
    </div>
  );
}
