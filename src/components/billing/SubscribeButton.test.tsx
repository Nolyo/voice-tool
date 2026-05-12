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

import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "alice@test.local" } }),
}));

vi.mock("@/lib/billing/checkout", () => ({
  openCheckout: vi.fn().mockResolvedValue({ opened_url: "https://ls/x" }),
}));

import "@/i18n";
import { openCheckout } from "@/lib/billing/checkout";
import { SubscribeButton } from "./SubscribeButton";

describe("SubscribeButton", () => {
  it("toggles between monthly and annual cycle", async () => {
    render(<SubscribeButton />);
    expect(screen.getByRole("button", { name: /Mensuel|Monthly/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: /Annuel|Annual/i }));
    expect(screen.getByRole("button", { name: /Annuel|Annual/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("calls openCheckout with the selected tier and cycle", async () => {
    render(<SubscribeButton />);
    fireEvent.click(screen.getAllByRole("button", { name: /S'abonner|Subscribe/i })[0]);
    await waitFor(() =>
      expect(openCheckout).toHaveBeenCalledWith({ tier: "starter", cycle: "monthly" }),
    );
  });

  it("uses the annual cycle after toggling", async () => {
    render(<SubscribeButton />);
    fireEvent.click(screen.getByRole("button", { name: /Annuel|Annual/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /S'abonner|Subscribe/i })[1]);
    await waitFor(() =>
      expect(openCheckout).toHaveBeenCalledWith({ tier: "pro", cycle: "annual" }),
    );
  });
});
