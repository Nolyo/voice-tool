// Module-level flag used to suppress the global Dashboard hotkey path while
// the onboarding modal is open. Brand-new users have no local model AND no
// cloud account — letting `audio-captured` reach the normal transcription
// pipeline would always error.
//
// The OnboardingFlow flips this to true on mount / false on unmount;
// useRecordingWorkflow reads it to decide whether to drop the event.

let active = false;
const listeners = new Set<(value: boolean) => void>();

export function isOnboardingActive(): boolean {
  return active;
}

export function setOnboardingActive(value: boolean): void {
  if (active === value) return;
  active = value;
  for (const listener of listeners) listener(value);
}

export function subscribeOnboardingActive(listener: (value: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
