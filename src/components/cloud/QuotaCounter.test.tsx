// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
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

import i18n from "@/i18n";
void i18n.changeLanguage("fr");
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QuotaCounter } from "./QuotaCounter";
import type { TrialStatus, UsagePlan } from "@/contexts/CloudContext";
import type { MonthlyBreakdown } from "@/lib/usage/breakdown";

const mockUseUsage = vi.fn();
const mockUseAuth = vi.fn();
const mockUseCloud = vi.fn();

vi.mock("@/hooks/useUsage", () => ({ useUsage: () => mockUseUsage() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mockUseAuth() }));
vi.mock("@/hooks/useCloud", () => ({ useCloud: () => mockUseCloud() }));

interface UsageState {
  trial: TrialStatus;
  monthly_minutes_used: number;
  monthly_minutes_breakdown: MonthlyBreakdown;
  plan: UsagePlan | null;
  loading: boolean;
}

function setUsage(state: Partial<UsageState>) {
  mockUseUsage.mockReturnValue({
    trial: { is_active: false, minutes_remaining: 0, expires_at: null },
    monthly_minutes_used: 0,
    monthly_minutes_breakdown: { trial: 0, quota: 0, overage: 0 },
    plan: null,
    loading: false,
    refresh: vi.fn(),
    ...state,
  });
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({ user: { id: "u1" } });
  mockUseCloud.mockReturnValue({ hasCloudSelected: true });
});

afterEach(() => {
  cleanup();
  mockUseUsage.mockReset();
});

describe("QuotaCounter", () => {
  it("shows trial pill when trial is active", () => {
    setUsage({
      trial: {
        is_active: true,
        minutes_remaining: 49,
        expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      },
    });
    render(<QuotaCounter />);
    expect(screen.getByText(/49 min d'essai/i)).toBeInTheDocument();
  });

  it("computes plan remaining from breakdown.quota, not monthly_minutes_used", () => {
    setUsage({
      trial: { is_active: false, minutes_remaining: 0, expires_at: null },
      plan: { plan: "starter", quota_minutes: 400 },
      monthly_minutes_used: 80,
      monthly_minutes_breakdown: { trial: 30, quota: 50, overage: 0 },
    });
    render(<QuotaCounter />);
    // 400 - breakdown.quota(50) = 350, NOT 400 - monthly_minutes_used(80) = 320
    expect(screen.getByText(/350 min restantes/i)).toBeInTheDocument();
  });

  it("does not pollute plan counter with mid-month residual trial usage", () => {
    setUsage({
      trial: { is_active: false, minutes_remaining: 0, expires_at: null },
      plan: { plan: "starter", quota_minutes: 400 },
      monthly_minutes_used: 30,
      monthly_minutes_breakdown: { trial: 30, quota: 0, overage: 0 },
    });
    render(<QuotaCounter />);
    expect(screen.getByText(/400 min restantes/i)).toBeInTheDocument();
  });

  it("renders nothing when hasCloudSelected is false", () => {
    mockUseCloud.mockReturnValue({ hasCloudSelected: false });
    setUsage({ plan: { plan: "starter", quota_minutes: 400 } });
    const { container } = render(<QuotaCounter />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when loading", () => {
    setUsage({ loading: true, plan: { plan: "starter", quota_minutes: 400 } });
    const { container } = render(<QuotaCounter />);
    expect(container).toBeEmptyDOMElement();
  });
});
