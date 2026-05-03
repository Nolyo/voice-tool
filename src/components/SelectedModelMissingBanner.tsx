import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
    <div
      className="flex items-center gap-3 border-b px-6 py-2.5 text-sm vt-anim-fade-up"
      style={{
        borderColor: "oklch(from var(--vt-warn) l c h / 0.3)",
        background: "oklch(from var(--vt-warn) l c h / 0.1)",
        color: "var(--vt-warn)",
      }}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-medium">
          {t("modelMissing.titleBefore")}{" "}
          <code className="vt-mono">{settings.local_model_size}</code>{" "}
          {t("modelMissing.titleAfter")}
        </span>{" "}
        <span style={{ color: "oklch(from var(--vt-warn) l c h / 0.8)" }}>
          {t("modelMissing.subtitle")}
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onGoToSettings}
        className="shrink-0"
        style={{
          borderColor: "oklch(from var(--vt-warn) l c h / 0.4)",
          background: "oklch(from var(--vt-warn) l c h / 0.1)",
          color: "var(--vt-warn)",
        }}
      >
        {t("modelMissing.manage")}
      </Button>
    </div>
  );
}
