import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";

interface Props {
  onGoToSettings: () => void;
}

/**
 * Warning banner shown under the header when the currently selected
 * local model is not downloaded. Only renders when the provider is
 * Local and another model is available (otherwise the onboarding
 * wizard handles the empty-state case).
 */
export function SelectedModelMissingBanner({ onGoToSettings }: Props) {
  const { settings, isLoaded } = useSettings();
  const [selectedExists, setSelectedExists] = useState<boolean | null>(null);
  const [anyExists, setAnyExists] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (settings.transcription_provider !== "Local") {
      setSelectedExists(true);
      setAnyExists(true);
      return;
    }
    let cancelled = false;
    Promise.all([
      invoke<boolean>("check_local_model_exists", {
        model: settings.local_model_size || "base",
      }),
      invoke<boolean>("any_local_model_exists"),
    ])
      .then(([selected, any]) => {
        if (cancelled) return;
        setSelectedExists(selected);
        setAnyExists(any);
      })
      .catch(() => {
        if (cancelled) return;
        setSelectedExists(null);
        setAnyExists(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, settings.transcription_provider, settings.local_model_size]);

  const shouldShow =
    isLoaded &&
    settings.transcription_provider === "Local" &&
    selectedExists === false &&
    anyExists === true;

  if (!shouldShow) return null;

  return (
    <div className="flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-6 py-2.5 text-sm text-amber-700 dark:text-amber-400">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-medium">
          Modèle <code className="font-mono">{settings.local_model_size}</code>{" "}
          non téléchargé.
        </span>{" "}
        <span className="text-amber-700/80 dark:text-amber-400/80">
          La transcription ne fonctionnera pas tant que tu n'as pas téléchargé
          ce modèle ou sélectionné un autre modèle déjà installé.
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onGoToSettings}
        className="shrink-0 border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
      >
        Gérer les modèles
      </Button>
    </div>
  );
}
