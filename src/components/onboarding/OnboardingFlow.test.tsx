// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

vi.hoisted(() => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    },
    configurable: true,
    writable: true,
  });
  if (!("navigator" in globalThis) || !globalThis.navigator?.language) {
    Object.defineProperty(globalThis, "navigator", {
      value: { language: "fr-FR" },
      configurable: true,
      writable: true,
    });
  }
});

import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const openAuthModal = vi.fn();
const updateSetting = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ openAuthModal, user: null }),
}));

vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({
    settings: { record_hotkey: "Ctrl+F11" },
    updateSetting,
  }),
}));

// Stub the local-wizard so we don't have to mount its full chain.
vi.mock("../OnboardingWizard", () => ({
  OnboardingWizard: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="local-wizard">
      <button onClick={onComplete}>finish</button>
    </div>
  ),
}));

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

beforeEach(() => {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "get_system_info") {
      return {
        total_ram_gb: 64,
        has_discrete_gpu: true,
        gpu_name: "Test GPU",
      };
    }
    return undefined;
  });
});

import "@/i18n";
import { OnboardingFlow } from "./OnboardingFlow";

describe("OnboardingFlow", () => {
  it("starts on the hero step", () => {
    render(<OnboardingFlow onComplete={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /Découvrir|Discover/i }),
    ).toBeInTheDocument();
  });

  it("navigates hero → capabilities → choice", () => {
    render(<OnboardingFlow onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Découvrir|Discover/i }));
    expect(
      screen.getByRole("button", { name: /Continuer$|Continue$/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Continuer$|Continue$/i }));
    expect(
      screen.getByRole("button", { name: /Créer mon compte|Create my account/i }),
    ).toBeInTheDocument();
  });

  it("hero skip jumps straight to choice", () => {
    render(<OnboardingFlow onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Passer|Skip/i }));
    expect(
      screen.getByRole("button", { name: /Créer mon compte|Create my account/i }),
    ).toBeInTheDocument();
  });

  it("cloud branch marks onboarding completed + opens auth modal + calls onComplete", () => {
    const onComplete = vi.fn();
    render(<OnboardingFlow onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /Passer|Skip/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Créer mon compte|Create my account/i }),
    );
    expect(updateSetting).toHaveBeenCalledWith("onboarding_completed", true);
    expect(openAuthModal).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
  });

  it("local branch renders OnboardingWizard", () => {
    render(<OnboardingFlow onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Passer|Skip/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Continuer en local|Continue with local/i }),
    );
    expect(screen.getByTestId("local-wizard")).toBeInTheDocument();
  });

  it("local-wizard completion marks onboarding completed + calls onComplete", () => {
    const onComplete = vi.fn();
    render(<OnboardingFlow onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /Passer|Skip/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Continuer en local|Continue with local/i }),
    );
    fireEvent.click(screen.getByText(/finish/i));
    expect(updateSetting).toHaveBeenCalledWith("onboarding_completed", true);
    expect(onComplete).toHaveBeenCalled();
  });

  it("later link on choice step marks completion + calls onComplete", () => {
    const onComplete = vi.fn();
    render(<OnboardingFlow onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /Passer|Skip/i }));
    fireEvent.click(screen.getByRole("button", { name: /Plus tard|Later/i }));
    expect(updateSetting).toHaveBeenCalledWith("onboarding_completed", true);
    expect(onComplete).toHaveBeenCalled();
  });

  it("auto-detects system info on mount", async () => {
    render(<OnboardingFlow onComplete={vi.fn()} />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_system_info");
    });
  });
});
