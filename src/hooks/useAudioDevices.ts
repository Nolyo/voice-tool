import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * Audio device information matching the Rust struct
 */
export interface AudioDevice {
  name: string;
  index: number;
  is_default: boolean;
}

/**
 * Hook to manage audio input devices
 */
export function useAudioDevices() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load audio devices from the backend
   */
  const loadDevices = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<AudioDevice[]>("get_audio_devices");
      setDevices(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      console.error("Failed to load audio devices:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Load devices on mount
  useEffect(() => {
    loadDevices();
  }, []);

  /**
   * Refresh the device list
   */
  const refresh = () => {
    loadDevices();
  };

  return {
    devices,
    isLoading,
    error,
    refresh,
  };
}
