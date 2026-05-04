import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";

export type CloudMode = "local" | "cloud" | "uninitialized";

export interface CloudContextValue {
  /**
   * Effective routing for the next transcription / post-process call.
   * "cloud" requires: signed-in user, server-side eligibility (active trial
   * or active subscription), AND the user explicitly picked "LexenaCloud" as
   * their transcription provider in settings. Anything else falls back to
   * "local" — meaning the local Whisper / user's API key path.
   */
  mode: CloudMode;
  /** Whether the user *could* use the cloud (server-side check). Independent of their picker choice. */
  isCloudEligible: boolean;
  /** Whether the user has selected LexenaCloud in their settings. */
  hasCloudSelected: boolean;
  setEligibility: (eligible: boolean) => void;
}

export const CloudContext = createContext<CloudContextValue>({
  mode: "uninitialized",
  isCloudEligible: false,
  hasCloudSelected: false,
  setEligibility: () => {},
});

export function CloudProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [eligible, setEligible] = useState(false);

  const hasCloudSelected = settings.transcription_provider === "LexenaCloud";

  const mode: CloudMode = useMemo(() => {
    if (!user) return "local";
    if (!hasCloudSelected) return "local";
    return eligible ? "cloud" : "local";
  }, [user, eligible, hasCloudSelected]);

  useEffect(() => {
    if (!user) setEligible(false);
  }, [user]);

  const value: CloudContextValue = {
    mode,
    isCloudEligible: eligible,
    hasCloudSelected,
    setEligibility: setEligible,
  };
  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>;
}
