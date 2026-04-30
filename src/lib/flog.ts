import { invoke } from "@tauri-apps/api/core";

/**
 * Front-end log helper that pipes messages through the Rust `frontend_log`
 * Tauri command so they end up in the same persisted ring buffer as backend
 * tracing output. Drops silently if the command isn't available (e.g. when
 * the component is rendered in a vitest jsdom environment).
 */
export function flog(
  message: string,
  level: "info" | "warn" | "error" = "info",
): void {
  invoke("frontend_log", { level, message }).catch(() => {});
}
