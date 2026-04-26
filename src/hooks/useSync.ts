import { useContext } from "react";
import { SyncContext, type SyncContextValue } from "@/contexts/SyncContext";

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within SyncProvider");
  return ctx;
}
