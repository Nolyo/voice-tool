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
 *
 * `authResolved` MUST be false while the auth session is still being restored
 * (AuthContext status === "loading"). The migration decision depends on whether
 * a user is signed in, and that signal only becomes trustworthy once auth has
 * settled. Deciding earlier — e.g. on a freshly imported profile reloaded by
 * switch_profile, where settings load before the Supabase session is restored —
 * would wrongly take the "no user → fresh Local" branch and flash an
 * unskippable onboarding wizard.
 */
export function useOnboardingCheck(
  settings: Settings,
  isLoaded: boolean,
  user: User | null,
  authResolved: boolean,
): { showOnboarding: boolean; recheck: () => void } {
  const { updateSetting } = useSettings();
  const [migrationDone, setMigrationDone] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const migrationAttempted = useRef(false);

  useEffect(() => {
    if (!isLoaded || !authResolved) return;
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
    authResolved,
    settings.onboarding_completed,
    settings.transcription_provider,
    user,
    updateSetting,
    refreshKey,
  ]);

  const recheck = useCallback(() => setRefreshKey((k) => k + 1), []);

  const showOnboarding =
    isLoaded && authResolved && migrationDone && !settings.onboarding_completed;

  return { showOnboarding, recheck };
}
