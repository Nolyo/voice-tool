// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";

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

import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({
    settings: { record_hotkey: "Ctrl+F11" },
  }),
}));

import "@/i18n";
import { CapabilitiesStep } from "./CapabilitiesStep";

describe("CapabilitiesStep", () => {
  it("renders the three capability cards", () => {
    render(<CapabilitiesStep onContinue={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText(/Raccourci global|Global hotkey/i)).toBeInTheDocument();
    expect(screen.getByText(/Post-process IA|AI post-processing/i)).toBeInTheDocument();
    expect(screen.getByText(/Insertion partout|Paste anywhere/i)).toBeInTheDocument();
  });

  it("shows the cloud-only badge on the AI card", () => {
    render(<CapabilitiesStep onContinue={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText(/Cloud uniquement|Cloud only/i)).toBeInTheDocument();
  });

  it("renders the user's current hotkey", () => {
    render(<CapabilitiesStep onContinue={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getAllByText("Ctrl+F11").length).toBeGreaterThan(0);
  });

  it("calls onContinue when continue button is clicked", () => {
    const onContinue = vi.fn();
    render(<CapabilitiesStep onContinue={onContinue} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Continuer|Continue/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("calls onBack when back button is clicked", () => {
    const onBack = vi.fn();
    render(<CapabilitiesStep onContinue={vi.fn()} onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: /Retour|Back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
