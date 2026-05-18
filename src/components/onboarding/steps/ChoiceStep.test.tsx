// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";

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
  vi.clearAllMocks();
});

import "@/i18n";
import { ChoiceStep } from "./ChoiceStep";

describe("ChoiceStep", () => {
  const baseProps = {
    systemInfo: null,
    isEligible: true,
    onBack: vi.fn(),
    onCloud: vi.fn(),
    onLocal: vi.fn(),
    onLater: vi.fn(),
  };

  it("renders both branch CTAs", () => {
    render(<ChoiceStep {...baseProps} />);
    expect(
      screen.getByRole("button", { name: /Créer mon compte|Create my account/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Continuer en local|Continue with local/i }),
    ).toBeInTheDocument();
  });

  it("calls onCloud when the cloud CTA is clicked", () => {
    const onCloud = vi.fn();
    render(<ChoiceStep {...baseProps} onCloud={onCloud} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Créer mon compte|Create my account/i }),
    );
    expect(onCloud).toHaveBeenCalledTimes(1);
  });

  it("calls onLocal when the local CTA is clicked", () => {
    const onLocal = vi.fn();
    render(<ChoiceStep {...baseProps} onLocal={onLocal} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Continuer en local|Continue with local/i }),
    );
    expect(onLocal).toHaveBeenCalledTimes(1);
  });

  it("calls onLater when the discreet later link is clicked", () => {
    const onLater = vi.fn();
    render(<ChoiceStep {...baseProps} onLater={onLater} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Plus tard|Later/i }),
    );
    expect(onLater).toHaveBeenCalledTimes(1);
  });

  it("does not show 'not recommended' badge when system has a discrete GPU", () => {
    render(
      <ChoiceStep
        {...baseProps}
        systemInfo={{
          total_ram_gb: 16,
          has_discrete_gpu: true,
          gpu_name: "GTX 1080",
        }}
        isEligible={true}
      />,
    );
    expect(
      screen.queryByText(/Déconseillé|Not recommended/i),
    ).not.toBeInTheDocument();
  });

  it("does not show 'not recommended' badge when machine has ≥ 32 GB RAM (no GPU)", () => {
    render(
      <ChoiceStep
        {...baseProps}
        systemInfo={{
          total_ram_gb: 64,
          has_discrete_gpu: false,
          gpu_name: null,
        }}
        isEligible={true}
      />,
    );
    expect(
      screen.queryByText(/Déconseillé|Not recommended/i),
    ).not.toBeInTheDocument();
  });

  it("shows 'not recommended' badge + reason when machine has no GPU and < 32 GB RAM", () => {
    render(
      <ChoiceStep
        {...baseProps}
        systemInfo={{
          total_ram_gb: 16,
          has_discrete_gpu: false,
          gpu_name: null,
        }}
        isEligible={false}
      />,
    );
    expect(screen.getByText(/Déconseillé|Not recommended/i)).toBeInTheDocument();
    expect(screen.getByText(/16\s*Go|16\s*GB/i)).toBeInTheDocument();
  });
});
