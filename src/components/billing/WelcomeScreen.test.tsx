// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

// Stub localStorage / navigator before any module under test loads, since
// `@/i18n` (transitively imported via useTranslation init) reads them at
// module load time.
vi.hoisted(() => {
  const store = new Map<string, string>();
  const localStorageStub = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageStub,
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

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ openAuthModal, user: null }),
}));

// Replace the wizard with a stub so the test focuses on the choose-screen
// behaviour and doesn't pull in invoke / Tauri events.
vi.mock("../OnboardingWizard", () => ({
  OnboardingWizard: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="local-wizard">
      <button onClick={onComplete}>finish</button>
    </div>
  ),
}));

// Default invoke mock — overridden per-test via mockImplementationOnce.
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import "@/i18n";
import { WelcomeScreen } from "./WelcomeScreen";

beforeEach(() => {
  // Default to "eligible" (GPU) so the existing tests don't see the warning.
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

describe("WelcomeScreen", () => {
  it("opens auth modal on branch A click", () => {
    const onComplete = vi.fn();
    render(<WelcomeScreen onComplete={onComplete} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Créer mon compte|Create my account/i }),
    );
    expect(openAuthModal).toHaveBeenCalledWith();
    expect(onComplete).toHaveBeenCalled();
  });

  it("renders OnboardingWizard on branch B click", () => {
    const onComplete = vi.fn();
    render(<WelcomeScreen onComplete={onComplete} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Continuer en local|Continue with local/i }),
    );
    expect(screen.getByTestId("local-wizard")).toBeInTheDocument();
  });

  it("does not show 'not recommended' badge when system has a discrete GPU", async () => {
    invokeMock.mockResolvedValueOnce({
      total_ram_gb: 16,
      has_discrete_gpu: true,
      gpu_name: "GTX 1080",
    });
    render(<WelcomeScreen onComplete={vi.fn()} />);
    // Wait one tick to ensure the post-detection render has happened.
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_system_info");
    });
    expect(
      screen.queryByText(/Déconseillé|Not recommended/i),
    ).not.toBeInTheDocument();
  });

  it("does not show 'not recommended' badge when machine has ≥ 32 GB RAM (no GPU)", async () => {
    invokeMock.mockResolvedValueOnce({
      total_ram_gb: 64,
      has_discrete_gpu: false,
      gpu_name: null,
    });
    render(<WelcomeScreen onComplete={vi.fn()} />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_system_info");
    });
    expect(
      screen.queryByText(/Déconseillé|Not recommended/i),
    ).not.toBeInTheDocument();
  });

  it("shows 'not recommended' badge + reason when machine has no GPU and < 32 GB RAM", async () => {
    invokeMock.mockResolvedValueOnce({
      total_ram_gb: 16,
      has_discrete_gpu: false,
      gpu_name: null,
    });
    render(<WelcomeScreen onComplete={vi.fn()} />);
    expect(
      await screen.findByText(/Déconseillé|Not recommended/i),
    ).toBeInTheDocument();
    // The reason text mentions the detected RAM (16 GB).
    expect(
      await screen.findByText(/16\s*Go|16\s*GB/i),
    ).toBeInTheDocument();
  });
});
