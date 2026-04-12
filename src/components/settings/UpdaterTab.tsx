"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, RefreshCw, Check, AlertCircle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpdaterContext } from "@/contexts/UpdaterContext";
import { useSettings } from "@/hooks/useSettings";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function Divider() {
  return <div className="h-px bg-border" />;
}

export function UpdaterTab() {
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
  const [currentVersion, setCurrentVersion] = useState<string>("");

  useEffect(() => {
    const loadVersion = async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const version = await getVersion();
        setCurrentVersion(version);
      } catch (err) {
        console.error("Failed to get app version:", err);
      }
    };
    loadVersion();
    checkUpdaterAvailability();
  }, [checkUpdaterAvailability]);

  const locale = i18n.language === 'en' ? 'en-US' : 'fr-FR';

  return (
    <div className="space-y-3 pb-6">
      {/* Main card: version + check */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Version row + button */}
        <div className="flex items-center justify-between px-5 py-4 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Download className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('updater.installedVersion')}</p>
              <p className="font-mono font-bold text-foreground text-base leading-tight">
                v{currentVersion}
              </p>
            </div>
          </div>
          <Button
            onClick={checkForUpdates}
            disabled={isChecking || isDownloading || updaterAvailable === false}
            variant="outline"
            className="shrink-0"
          >
            <RefreshCw
              className={`w-4 h-4 ${isChecking ? "animate-spin" : ""}`}
            />
            {isChecking ? t('updater.checking') : t('updater.checkUpdates')}
          </Button>
        </div>

        {/* Dev / portable mode warning */}
        {updaterAvailable === false && (
          <>
            <Divider />
            <div className="px-5 py-4 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t('updater.unavailableTitle')}
                </p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {t('updater.unavailableDesc').split('GitHub')[0]}
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={async (e) => {
                      e.preventDefault();
                      const { openUrl } = await import(
                        "@tauri-apps/plugin-opener"
                      );
                      await openUrl("https://github.com/Nolyo/voice-tool");
                    }}
                  >
                    GitHub
                  </button>
                  .
                </p>
              </div>
            </div>
          </>
        )}

        {/* Up to date */}
        {updateInfo && !updateInfo.available && !error && (
          <>
            <Divider />
            <div className="px-5 py-3 flex items-center gap-2.5 bg-green-500/5">
              <Check className="w-4 h-4 text-green-500 shrink-0" />
              <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                {t('updater.upToDate')}
              </p>
            </div>
          </>
        )}

        {/* Update available */}
        {updateInfo?.available && (
          <>
            <Divider />
            <div className="px-5 py-4 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <Download className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {t('updater.newVersionTitle')}{" "}
                      <span className="text-primary font-mono">
                        v{updateInfo.version}
                      </span>
                    </p>
                    {updateInfo.date && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t('updater.publishedOn')}{" "}
                        {new Date(updateInfo.date).toLocaleDateString(locale, {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                </div>
                {!isDownloading && (
                  <Button
                    onClick={downloadAndInstall}
                    disabled={isDownloading}
                    size="sm"
                    className="shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {t('updater.install')}
                  </Button>
                )}
              </div>

              {updateInfo.body && (
                <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
                  <p className="text-xs font-medium text-foreground mb-1.5">
                    {t('updater.releaseNotes')}
                  </p>
                  <div className="text-xs text-muted-foreground whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {updateInfo.body}
                  </div>
                </div>
              )}

              {isDownloading && downloadProgress && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {t('updater.downloading')}
                    </span>
                    <span className="font-mono font-bold text-primary tabular-nums">
                      {downloadProgress.percentage}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${downloadProgress.percentage}%` }}
                    />
                  </div>
                  {downloadProgress.total && (
                    <p className="text-xs text-muted-foreground text-center font-mono">
                      {(downloadProgress.downloaded / 1024 / 1024).toFixed(1)}{" "}
                      MB /{" "}
                      {(downloadProgress.total / 1024 / 1024).toFixed(1)} MB
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Error */}
        {error && (
          <>
            <Divider />
            <div className="px-5 py-4 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t('updater.checkError')}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Preferences + security */}
      <div className="rounded-xl border border-border bg-card px-5 py-4 space-y-4">
        <div
          className="flex items-start gap-3 cursor-pointer"
          onClick={() =>
            updateSetting(
              "auto_check_updates",
              !(settings.auto_check_updates ?? true)
            )
          }
        >
          <Checkbox
            id="auto-check-updates"
            checked={settings.auto_check_updates ?? true}
            onCheckedChange={(checked) =>
              updateSetting("auto_check_updates", checked as boolean)
            }
            className="mt-0.5"
          />
          <Label
            htmlFor="auto-check-updates"
            className="text-sm text-foreground cursor-pointer leading-relaxed flex-1"
          >
            {t('updater.autoCheck')}
            <span className="block text-xs text-muted-foreground font-normal mt-0.5">
              {t('updater.autoCheckDesc')}
            </span>
          </Label>
        </div>

        <Divider />

        <div className="space-y-1.5">
          <Label
            htmlFor="update-channel"
            className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
          >
            {t('updater.updateChannel')}
          </Label>
          <Select
            value={settings.update_channel ?? "stable"}
            onValueChange={(value) =>
              updateSetting("update_channel", value as "stable" | "beta")
            }
          >
            <SelectTrigger
              id="update-channel"
              className="h-9 bg-background/50 w-48"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stable">{t('updater.channelStable')}</SelectItem>
              <SelectItem value="beta">{t('updater.channelBeta')}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t('updater.channelHelp')}
          </p>
        </div>

        <Divider />

        <div className="flex items-start gap-2">
          <Shield className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">
              {t('updater.secureUpdates')} —{" "}
            </span>
            {t('updater.secureUpdatesDesc')}
          </p>
        </div>
      </div>
    </div>
  );
}
