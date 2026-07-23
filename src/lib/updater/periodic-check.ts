// Decides whether the hourly background update check is due. Kept as a pure
// module so the timestamp/guard logic is unit-testable outside React.

export const PERIODIC_CHECK_INTERVAL_MS = 3_600_000; // 1 hour
export const PERIODIC_TICK_MS = 60_000; // 1 minute

export interface PeriodicCheckState {
  /** Epoch ms of the last check started (startup, manual or periodic), or null. */
  lastCheckTime: number | null;
  updateAvailable: boolean;
  isChecking: boolean;
  isDownloading: boolean;
}

export function shouldCheckNow(state: PeriodicCheckState, now: number): boolean {
  if (state.updateAvailable || state.isChecking || state.isDownloading) {
    return false;
  }
  if (state.lastCheckTime === null) {
    return true;
  }
  return now - state.lastCheckTime >= PERIODIC_CHECK_INTERVAL_MS;
}
