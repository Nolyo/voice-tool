import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";

export type CloudMode = "local" | "cloud" | "uninitialized";

export interface CloudContextValue {
  mode: CloudMode;
  isCloudEligible: boolean;
  setEligibility: (eligible: boolean) => void;
}

export const CloudContext = createContext<CloudContextValue>({
  mode: "uninitialized",
  isCloudEligible: false,
  setEligibility: () => {},
});

export function CloudProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [eligible, setEligible] = useState(false);

  const mode: CloudMode = useMemo(() => {
    if (!user) return "local";
    return eligible ? "cloud" : "local";
  }, [user, eligible]);

  useEffect(() => {
    if (!user) setEligible(false);
  }, [user]);

  const value: CloudContextValue = {
    mode,
    isCloudEligible: eligible,
    setEligibility: setEligible,
  };
  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>;
}
