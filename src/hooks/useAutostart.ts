import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * Manage Windows autostart toggle state. Loads current value on mount and
 * exposes a `toggle` callback that persists to the OS via Tauri.
 */
export function useAutostart() {
  const [enabled, setEnabled] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const current = await invoke<boolean>("is_autostart_enabled");
        setEnabled(current);
      } catch (error) {
        console.error("Failed to load autostart state:", error);
      }
    };
    load();
  }, []);

  const toggle = useCallback(async (checked: boolean) => {
    setIsUpdating(true);
    try {
      await invoke("set_autostart", { enable: checked });
      setEnabled(checked);
    } catch (error) {
      console.error("Failed to update autostart:", error);
      alert(`Erreur lors de la mise à jour du démarrage automatique: ${error}`);
    } finally {
      setIsUpdating(false);
    }
  }, []);

  return { enabled, isUpdating, toggle };
}
