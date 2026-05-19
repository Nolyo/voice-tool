import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { User } from "@supabase/supabase-js";
import type { AppSettings } from "@/lib/settings";
import { useSettings } from "@/hooks/useSettings";

type Settings = AppSettings["settings"];

/**
 * Decides whether to show the first-run onboarding wizard.
 *
 * The single source of truth is `settings.onboarding_completed`. On first run
 * for an existing beta user (model already downloaded, account signed in, or
 * cloud provider selected), a silent migration flips that flag to true so the
 * wizard does not pop up on upgrade.
 *
 * The `recheck` callback is exposed so callers can force-revaluate after they
 * mutate state outside the settings store (e.g. finishing a local model
 * download).
 */
export function useOnboardingCheck(
  settings: Settings,
  isLoaded: boolean,
  user: User | null,
): { showOnboarding: boolean; recheck: () => void } {
  const { updateSetting } = useSettings();
  const [migrationDone, setMigrationDone] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const migrationAttempted = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (settings.onboarding_completed) {
      setMigrationDone(true);
      return;
    }
    if (migrationAttempted.current) return;
    migrationAttempted.current = true;

    let cancelled = false;

    // Signed-in users or cloud provider users skip the wizard outright.
    if (user || settings.transcription_provider !== "Local") {
      void updateSetting("onboarding_completed", true);
      setMigrationDone(true);
      return;
    }

    // Otherwise check the filesystem — a beta user with a downloaded model is
    // assumed to have completed onboarding under the old flow.
    invoke<boolean>("any_local_model_exists")
      .then((exists) => {
        if (cancelled) return;
        if (exists) {
          void updateSetting("onboarding_completed", true);
        }
        setMigrationDone(true);
      })
      .catch(() => {
        if (!cancelled) setMigrationDone(true);
      });

    return () => {
      cancelled = true;
    };
  }, [
    isLoaded,
    settings.onboarding_completed,
    settings.transcription_provider,
    user,
    updateSetting,
    refreshKey,
  ]);

  const recheck = useCallback(() => setRefreshKey((k) => k + 1), []);

  const showOnboarding =
    isLoaded && migrationDone && !settings.onboarding_completed;

  return { showOnboarding, recheck };
}
