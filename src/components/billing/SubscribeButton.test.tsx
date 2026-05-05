// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";

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

// Import the i18n config so useTranslation("billing") returns real strings.
import "@/i18n";
import { openCheckout } from "@/lib/billing/checkout";

describe("SubscribeButton (with stubbed env)", () => {
  // PLANS is built at module-init time from `import.meta.env.VITE_LS_*`.
  // Stub the env vars BEFORE importing SubscribeButton so the resulting
  // plans have real (non-PLACEHOLDER) variant_ids/slugs.
  beforeAll(async () => {
    vi.stubEnv("VITE_LS_STARTER_MONTHLY_VARIANT_ID", "111");
    vi.stubEnv("VITE_LS_STARTER_MONTHLY_SLUG", "starter-monthly");
    vi.stubEnv("VITE_LS_STARTER_ANNUAL_VARIANT_ID", "112");
    vi.stubEnv("VITE_LS_STARTER_ANNUAL_SLUG", "starter-annual");
    vi.stubEnv("VITE_LS_PRO_MONTHLY_VARIANT_ID", "211");
    vi.stubEnv("VITE_LS_PRO_MONTHLY_SLUG", "pro-monthly");
    vi.stubEnv("VITE_LS_PRO_ANNUAL_VARIANT_ID", "212");
    vi.stubEnv("VITE_LS_PRO_ANNUAL_SLUG", "pro-annual");
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("toggles between monthly and annual cycle", async () => {
    const { SubscribeButton } = await import("./SubscribeButton");
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
    const { SubscribeButton } = await import("./SubscribeButton");
    render(<SubscribeButton />);
    fireEvent.click(screen.getAllByRole("button", { name: /S'abonner|Subscribe/i })[0]);
    await waitFor(() =>
      expect(openCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: "u1", email: "alice@test.local" }),
      ),
    );
  });
});

describe("SubscribeButton (PLACEHOLDER guard)", () => {
  it("does not call openCheckout when variant_id is PLACEHOLDER", async () => {
    // Force PLACEHOLDER state by unstubbing env vars and resetting the module
    // graph so plans.ts re-evaluates with the `?? "PLACEHOLDER"` fallback.
    vi.unstubAllEnvs();
    vi.resetModules();

    const { SubscribeButton } = await import("./SubscribeButton");
    const checkoutMod = await import("@/lib/billing/checkout");
    const openCheckoutMock = vi.mocked(checkoutMod.openCheckout);
    openCheckoutMock.mockClear();

    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<SubscribeButton />);
    fireEvent.click(screen.getAllByRole("button", { name: /S'abonner|Subscribe/i })[0]);
    await new Promise((r) => setTimeout(r, 0));
    expect(openCheckoutMock).not.toHaveBeenCalled();
    expect(consoleErr).toHaveBeenCalledWith(expect.stringContaining("PLACEHOLDER"));
    consoleErr.mockRestore();
  });
});
