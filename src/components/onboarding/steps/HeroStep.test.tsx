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
import { HeroStep } from "./HeroStep";

describe("HeroStep", () => {
  it("renders headline and CTAs", () => {
    render(<HeroStep onContinue={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Découvrir|Discover/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Passer|Skip/i })).toBeInTheDocument();
  });

  it("calls onContinue when discover button is clicked", () => {
    const onContinue = vi.fn();
    render(<HeroStep onContinue={onContinue} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Découvrir|Discover/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("calls onSkip when skip button is clicked", () => {
    const onSkip = vi.fn();
    render(<HeroStep onContinue={vi.fn()} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole("button", { name: /Passer|Skip/i }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
