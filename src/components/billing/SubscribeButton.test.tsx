// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

// Stub localStorage / navigator before any module under test loads, since
// `@/i18n` (transitively imported by SubscribeButton via useTranslation init)
// reads them at module load time. jsdom provides them by default but we keep
// this defensive stub in line with src/components/settings/sections/AccountSection.aal2-disable.test.ts.
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

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "alice@test.local" } }),
}));

vi.mock("@/lib/billing/checkout", () => ({
  openCheckout: vi.fn().mockResolvedValue({ opened_url: "https://ls/x" }),
}));

// Import the i18n config so useTranslation("billing") returns real strings.
import "@/i18n";
import { SubscribeButton } from "./SubscribeButton";
import { openCheckout } from "@/lib/billing/checkout";

describe("SubscribeButton", () => {
  it("toggles between monthly and annual cycle", () => {
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

  it("calls openCheckout with the selected plan", async () => {
    render(<SubscribeButton />);
    fireEvent.click(screen.getAllByRole("button", { name: /S'abonner|Subscribe/i })[0]);
    await waitFor(() =>
      expect(openCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: "u1", email: "alice@test.local" }),
      ),
    );
  });
});
