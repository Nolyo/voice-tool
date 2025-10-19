import { useSettingsContext } from "@/contexts/SettingsContext";

/**
 * Hook to manage application settings with persistence
 * This is a convenience wrapper around useSettingsContext
 */
export function useSettings() {
  return useSettingsContext();
}
