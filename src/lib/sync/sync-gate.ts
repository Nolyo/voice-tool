/**
 * Process-wide sync gate. `switch_profile` restarts the app, so one OS process
 * serves exactly one active profile; SyncContext sets this once the `enabled`
 * flag for the running profile is known. Inline enqueue paths (notes-store,
 * folders-store) consult `isSyncActive()` so mutations in a profile where sync
 * is off never touch the queue. Cf. ADR 0016 §10 (sync mono-profil).
 */
let active = false;

export function setSyncActive(value: boolean): void {
  active = value;
}

export function isSyncActive(): boolean {
  return active;
}

export function __resetForTests(): void {
  active = false;
}
