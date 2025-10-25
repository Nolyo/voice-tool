"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw, Check, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { useUpdaterContext } from "@/contexts/UpdaterContext";
import { useSettings } from "@/hooks/useSettings";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";

export function UpdaterTab() {
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

  // Load current version and check updater availability
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

  return (
    <div className="space-y-4 pb-6">
      {/* Current Version Card */}
      <div className="rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden transition-all hover:border-border hover:shadow-lg hover:shadow-primary/5">
        <div className="px-5 py-4 bg-gradient-to-r from-primary/5 via-primary/3 to-transparent border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shadow-sm">
              <Download className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Version installée
              </h3>
              <p className="text-xs text-muted-foreground">
                Votre version actuelle
              </p>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50 flex items-center justify-center">
            <p className="text-lg font-mono font-semibold text-foreground">
              v{currentVersion}
            </p>
          </div>
        </div>
      </div>

      {/* Update Check Card */}
      <div className="rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden transition-all hover:border-border hover:shadow-lg hover:shadow-primary/5">
        <div className="px-5 py-4 bg-gradient-to-r from-primary/5 via-primary/3 to-transparent border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shadow-sm">
              <RefreshCw className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Mises à jour
              </h3>
              <p className="text-xs text-muted-foreground">
                Vérifier et installer les nouvelles versions
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Warning for dev/portable mode */}
          {updaterAvailable === false && (
            <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-foreground mb-1">
                  Mises à jour automatiques indisponibles
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Le système de mise à jour automatique n'est pas disponible en
                  mode développement ou en version portable. Téléchargez
                  manuellement la dernière version depuis{" "}
                  <button
                    type="button"
                    title="Ouvrir dans un navigateur"
                    className="text-blue-500 hover:underline cursor-pointer inline"
                    onClick={async (e) => {
                      e.preventDefault();
                      const { openUrl } = await import("@tauri-apps/plugin-opener");
                      await openUrl("https://github.com/Nolyo/voice-tool");
                    }}
                  >
                    GitHub
                  </button>{" "}
                  .
                </p>
              </div>
            </div>
          )}

          <Button
            onClick={checkForUpdates}
            disabled={isChecking || isDownloading || updaterAvailable === false}
            className="w-full h-11 font-medium shadow-sm hover:shadow-md transition-all"
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${isChecking ? "animate-spin" : ""}`}
            />
            {isChecking
              ? "Vérification en cours..."
              : "Vérifier les mises à jour"}
          </Button>

          {/* Update Available */}
          {updateInfo?.available && (
            <div className="space-y-4 p-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <Download className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">
                    Nouvelle version disponible
                  </h4>
                  <p className="text-lg font-mono font-bold text-primary">
                    v{updateInfo.version}
                  </p>
                  {updateInfo.date && (
                    <p className="text-xs text-muted-foreground">
                      Publiée le{" "}
                      {new Date(updateInfo.date).toLocaleDateString("fr-FR", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  )}
                  {updateInfo.body && (
                    <div className="mt-3 p-3.5 rounded-lg bg-background/50 border border-border/50">
                      <p className="text-xs font-semibold text-foreground mb-2">
                        Notes de version
                      </p>
                      <div className="text-xs text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
                        {updateInfo.body}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Download Progress */}
              {isDownloading && downloadProgress && (
                <div className="space-y-2.5 p-4 rounded-lg bg-background/50 border border-border/50">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-medium">
                      Téléchargement en cours...
                    </span>
                    <span className="font-mono font-bold text-primary tabular-nums">
                      {downloadProgress.percentage}%
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-300 shadow-sm shadow-primary/50"
                      style={{ width: `${downloadProgress.percentage}%` }}
                    />
                  </div>
                  {downloadProgress.total && (
                    <p className="text-xs text-muted-foreground text-center font-mono">
                      {(downloadProgress.downloaded / 1024 / 1024).toFixed(1)}{" "}
                      MB / {(downloadProgress.total / 1024 / 1024).toFixed(1)}{" "}
                      MB
                    </p>
                  )}
                </div>
              )}

              {/* Install Button */}
              {!isDownloading && (
                <Button
                  onClick={downloadAndInstall}
                  disabled={isDownloading}
                  className="w-full h-11 font-medium shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Télécharger et installer
                </Button>
              )}

              <p className="text-xs text-muted-foreground text-center leading-relaxed">
                L'application redémarrera automatiquement pour finaliser
                l'installation
              </p>
            </div>
          )}

          {/* No Update Available */}
          {updateInfo && !updateInfo.available && !error && (
            <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-foreground mb-1">
                  Vous êtes à jour !
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Vous utilisez déjà la dernière version de Voice Tool
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-destructive/20 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-destructive" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-foreground mb-1">
                  Erreur lors de la vérification
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {error}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings Card */}
      <div className="rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden transition-all hover:border-border hover:shadow-lg hover:shadow-primary/5">
        <div className="px-5 py-4 bg-gradient-to-r from-primary/5 via-primary/3 to-transparent border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shadow-sm">
              <RefreshCw className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Préférences
              </h3>
              <p className="text-xs text-muted-foreground">
                Configuration des mises à jour
              </p>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div
            className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
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
              Vérifier les mises à jour au démarrage
              <span className="block text-xs text-muted-foreground mt-1">
                La vérification s'effectue 10 secondes après le lancement
              </span>
            </Label>
          </div>
        </div>
      </div>

      {/* Security Information Card */}
      <div className="rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden">
        <div className="p-5">
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground block mb-1.5">
                Mises à jour sécurisées
              </span>
              Toutes les mises à jour sont vérifiées cryptographiquement pour
              garantir leur authenticité. Le téléchargement s'effectue
              directement depuis GitHub Releases via une connexion HTTPS
              sécurisée.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
