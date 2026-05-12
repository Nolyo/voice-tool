import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings } from "@/lib/settings";

type Settings = AppSettings["settings"];

/**
 * Returns whether onboarding should be shown, plus a `recheck` callback
 * used after the wizard completes a download / saves an API key so the
 * condition re-evaluates even when no settings dependency changed.
 */
export function useOnboardingCheck(
  settings: Settings,
  isLoaded: boolean,
): { showOnboarding: boolean; recheck: () => void } {
  const [anyModelExists, setAnyModelExists] = useState<boolean | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!isLoaded) return;
    if (settings.transcription_provider !== "Local") {
      setAnyModelExists(true);
      return;
    }
    let cancelled = false;
    invoke<boolean>("any_local_model_exists")
      .then((exists) => {
        if (!cancelled) setAnyModelExists(exists);
      })
      .catch(() => {
        if (!cancelled) setAnyModelExists(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, settings.transcription_provider, refreshKey]);

  const recheck = useCallback(() => setRefreshKey((k) => k + 1), []);

  let showOnboarding = false;
  if (isLoaded && anyModelExists !== null) {
    // Onboarding only matters for the Local provider — Cloud relies on signin/billing.
    if (settings.transcription_provider === "Local")
      showOnboarding = !anyModelExists;
  }

  return { showOnboarding, recheck };
}
