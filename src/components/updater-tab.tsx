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
  } = useUpdaterContext();

  const { settings, updateSetting } = useSettings();
  const [currentVersion, setCurrentVersion] = useState<string>("");

  // Load current version
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
  }, []);

  return (
    <div className="space-y-6">
      {/* Current Version Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Download className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            Version actuelle
          </h3>
        </div>

        <div className="pl-10">
          <div className="p-4 rounded-lg bg-muted/50 border border-border">
            <p className="text-sm text-foreground font-mono">
              Voice Tool v{currentVersion}
            </p>
          </div>
        </div>
      </div>

      {/* Check for Updates Section */}
      <div className="space-y-4 pt-6 border-t border-border">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <RefreshCw className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            Vérification des mises à jour
          </h3>
        </div>

        <div className="pl-10 space-y-4">
          <Button
            onClick={checkForUpdates}
            disabled={isChecking || isDownloading}
            className="w-full"
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
            <div className="space-y-4 p-4 rounded-lg bg-primary/10 border border-primary/20">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <Download className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">
                    Nouvelle version disponible : v{updateInfo.version}
                  </h4>
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
                    <div className="mt-3 p-3 rounded-md bg-muted/50 border border-border">
                      <p className="text-xs font-semibold text-foreground mb-2">
                        Notes de version :
                      </p>
                      <div className="text-xs text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {updateInfo.body}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Download Progress */}
              {isDownloading && downloadProgress && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Téléchargement en cours...
                    </span>
                    <span className="font-mono text-foreground">
                      {downloadProgress.percentage}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${downloadProgress.percentage}%` }}
                    />
                  </div>
                  {downloadProgress.total && (
                    <p className="text-xs text-muted-foreground text-center">
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
                  className="w-full"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Télécharger et installer
                </Button>
              )}

              <p className="text-xs text-muted-foreground text-center">
                L'application se fermera automatiquement pour installer la mise
                à jour
              </p>
            </div>
          )}

          {/* No Update Available */}
          {updateInfo && !updateInfo.available && !error && (
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-foreground">
                  Vous êtes à jour !
                </h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Vous utilisez la dernière version de Voice Tool
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-4 h-4 text-destructive" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-foreground">
                  Erreur
                </h4>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings Section */}
      <div className="space-y-4 pt-6 border-t border-border">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <RefreshCw className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            Préférences
          </h3>
        </div>

        <div className="pl-10">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="auto-check-updates"
              checked={settings.auto_check_updates ?? true}
              onCheckedChange={(checked) =>
                updateSetting("auto_check_updates", checked as boolean)
              }
              className="mt-1"
            />
            <Label
              htmlFor="auto-check-updates"
              className="text-sm text-foreground cursor-pointer leading-relaxed"
            >
              Vérifier automatiquement les mises à jour au démarrage
              <span className="block text-xs text-muted-foreground mt-1">
                La vérification s'effectue 10 secondes après le lancement de
                l'application
              </span>
            </Label>
          </div>
        </div>
      </div>

      {/* Information Section */}
      <div className="pt-6 border-t border-border">
        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">
              Système de mise à jour sécurisé
            </span>
            <br />
            Les mises à jour sont vérifiées cryptographiquement pour garantir
            leur authenticité. Le téléchargement s'effectue directement depuis
            GitHub Releases via HTTPS.
          </p>
        </div>
      </div>
    </div>
  );
}
