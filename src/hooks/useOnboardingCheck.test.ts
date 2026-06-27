// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

afterEach(() => {
  vi.clearAllMocks();
});

const updateSetting = vi.fn();
vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({
    settings: {},
    updateSetting,
  }),
}));

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { useOnboardingCheck } from "./useOnboardingCheck";

const makeSettings = (overrides: Record<string, unknown> = {}) =>
  ({
    onboarding_completed: false,
    transcription_provider: "Local",
    ...overrides,
  // We only use a few fields; cast for the test harness.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

beforeEach(() => {
  invokeMock.mockReset();
  updateSetting.mockReset();
});

describe("useOnboardingCheck", () => {
  it("does not show onboarding when settings haven't loaded yet", () => {
    invokeMock.mockResolvedValue(false);
    const { result } = renderHook(() =>
      useOnboardingCheck(makeSettings(), false, null, true),
    );
    expect(result.current.showOnboarding).toBe(false);
  });

  it("does not show onboarding when onboarding_completed is already true", async () => {
    const { result } = renderHook(() =>
      useOnboardingCheck(
        makeSettings({ onboarding_completed: true }),
        true,
        null,
        true,
      ),
    );
    await waitFor(() => {
      expect(result.current.showOnboarding).toBe(false);
    });
    expect(updateSetting).not.toHaveBeenCalled();
  });

  it("migrates a signed-in user silently to completed", async () => {
    const user = { id: "abc" };
    renderHook(() =>
      useOnboardingCheck(
        makeSettings(),
        true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        user as any,
        true,
      ),
    );
    await waitFor(() => {
      expect(updateSetting).toHaveBeenCalledWith("onboarding_completed", true);
    });
    // The hook flips the persisted flag; the live `showOnboarding` value will
    // become `false` on the next render once the settings store re-emits with
    // the new value. We don't assert that here because the mock keeps the
    // settings prop stable.
  });

  it("migrates a user with non-Local provider silently to completed", async () => {
    renderHook(() =>
      useOnboardingCheck(
        makeSettings({ transcription_provider: "LexenaCloud" }),
        true,
        null,
        true,
      ),
    );
    await waitFor(() => {
      expect(updateSetting).toHaveBeenCalledWith("onboarding_completed", true);
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("migrates a user with a local model already installed to completed", async () => {
    invokeMock.mockResolvedValue(true);
    renderHook(() => useOnboardingCheck(makeSettings(), true, null, true));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("any_local_model_exists");
    });
    await waitFor(() => {
      expect(updateSetting).toHaveBeenCalledWith("onboarding_completed", true);
    });
  });

  it("shows onboarding for a fresh Local user with no model and no account", async () => {
    invokeMock.mockResolvedValue(false);
    const { result } = renderHook(() =>
      useOnboardingCheck(makeSettings(), true, null, true),
    );
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("any_local_model_exists");
    });
    // migrationDone flips → showOnboarding becomes true
    await waitFor(() => {
      expect(result.current.showOnboarding).toBe(true);
    });
    expect(updateSetting).not.toHaveBeenCalled();
  });

  it("waits for auth to resolve before deciding, then migrates a late-arriving user", async () => {
    // Reproduces the multi-device import bug: after switch_profile reloads the
    // app, settings load BEFORE the Supabase session is restored. While auth is
    // unresolved the hook must NOT commit the (premature) "no user → fresh Local"
    // decision, otherwise the onboarding wizard flashes and gets stuck.
    invokeMock.mockResolvedValue(false);
    const { result, rerender } = renderHook(
      ({ user, authResolved }) =>
        useOnboardingCheck(
          makeSettings(),
          true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          user as any,
          authResolved,
        ),
      { initialProps: { user: null as { id: string } | null, authResolved: false } },
    );

    // Auth still loading: no decision, no filesystem probe, no wizard.
    await waitFor(() => {
      expect(result.current.showOnboarding).toBe(false);
    });
    expect(invokeMock).not.toHaveBeenCalled();
    expect(updateSetting).not.toHaveBeenCalled();

    // Session restored with a signed-in user → silent migration (flips the
    // persisted flag), and the "no user → fresh Local" filesystem probe is never
    // taken. `showOnboarding` is not asserted here: the mocked settings prop
    // stays `onboarding_completed: false`, so the live flip isn't reflected (see
    // the "migrates a signed-in user" test for the same caveat).
    rerender({ user: { id: "abc" }, authResolved: true });
    await waitFor(() => {
      expect(updateSetting).toHaveBeenCalledWith("onboarding_completed", true);
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
