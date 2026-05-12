// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";

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

import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
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

import "@/i18n";
import { WelcomeScreen } from "./WelcomeScreen";

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
});
