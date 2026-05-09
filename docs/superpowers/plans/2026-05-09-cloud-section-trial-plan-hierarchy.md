# Cloud Section — Trial + Plan Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre `Settings → Cloud` en une hiérarchie unique "Plan principal + bonus essai en sous-élément" pour lever l'ambiguïté entre quota du trial et quota du plan, et corriger le calcul `QuotaCounter` du header qui mélange les deux.

**Architecture:** 100% UI/UX. Aucun changement DB ni worker. Le `CloudContext` est étendu avec un `monthly_minutes_breakdown` calculé client-side via une 4ᵉ requête sur `usage_events` filtrée par `source`. `CloudSection` et `QuotaCounter` consomment ce breakdown au lieu de l'agrégat global pour leurs compteurs plan.

**Tech Stack:** React 19, TypeScript, react-i18next, Tauri, Supabase JS, Vitest + React Testing Library (jsdom).

**Spec source:** `docs/superpowers/specs/2026-05-09-cloud-section-trial-plan-hierarchy-design.md`

---

## File Structure

**Created:**
- `src/lib/usage/breakdown.ts` — helper pur `computeBreakdown` (agrège des events par `source`).
- `src/lib/usage/breakdown.test.ts` — tests unitaires Vitest (env `node`).
- `src/components/settings/sections/CloudSection.test.tsx` — tests RTL Vitest (env `jsdom`).
- `src/components/cloud/QuotaCounter.test.tsx` — tests RTL Vitest (env `jsdom`).

**Modified:**
- `src/contexts/CloudContext.tsx` — ajout du type `MonthlyBreakdown`, du state `monthlyBreakdown`, du 4ᵉ fetch dans `refreshUsage`, exposition dans la value.
- `src/hooks/useUsage.ts` — exposer `monthly_minutes_breakdown`.
- `src/components/settings/sections/CloudSection.tsx` — restructuration en bloc unique "Plan + bonus".
- `src/components/cloud/QuotaCounter.tsx` — utiliser `breakdown.quota` au lieu de `monthly_minutes_used`.
- `src/locales/fr/cloud.json` — ajout `settings.bonus.*` + `settings.plan.minutes_progress*`. Suppression des clés `settings.trial.*` (utilisées uniquement par l'ancien layout de `CloudSection`).
- `src/locales/en/cloud.json` — pendants EN.

**Untouched (vérifier puis confirmer hors-scope) :** worker `transcription-api`, migrations Supabase, webhook Lemon Squeezy, Edge Functions billing, `subscriptions.trial_ends_at`.

---

## Task 1: Helper `computeBreakdown` (TDD)

**Files:**
- Create: `src/lib/usage/breakdown.ts`
- Test: `src/lib/usage/breakdown.test.ts`

- [ ] **Step 1.1: Write the failing test**

Create `src/lib/usage/breakdown.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeBreakdown, type UsageEventRow } from "./breakdown";

describe("computeBreakdown", () => {
  it("returns zeros for an empty list", () => {
    expect(computeBreakdown([])).toEqual({ trial: 0, quota: 0, overage: 0 });
  });

  it("sums units per source", () => {
    const rows: UsageEventRow[] = [
      { source: "trial", units: 1.5 },
      { source: "trial", units: 2.25 },
      { source: "quota", units: 10 },
      { source: "overage", units: 3 },
    ];
    expect(computeBreakdown(rows)).toEqual({ trial: 3.75, quota: 10, overage: 3 });
  });

  it("ignores unknown sources (forward-compat)", () => {
    const rows = [
      { source: "trial", units: 1 },
      { source: "future_source" as unknown as UsageEventRow["source"], units: 5 },
    ];
    expect(computeBreakdown(rows as UsageEventRow[])).toEqual({
      trial: 1,
      quota: 0,
      overage: 0,
    });
  });

  it("counts zero-unit events", () => {
    expect(computeBreakdown([{ source: "trial", units: 0 }])).toEqual({
      trial: 0,
      quota: 0,
      overage: 0,
    });
  });

  it("coerces units to number when DB returns string (numeric)", () => {
    const rows = [
      { source: "quota", units: "2.50" as unknown as number },
      { source: "quota", units: 1.5 },
    ];
    expect(computeBreakdown(rows as UsageEventRow[])).toEqual({
      trial: 0,
      quota: 4,
      overage: 0,
    });
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `pnpm test src/lib/usage/breakdown.test.ts`
Expected: FAIL with `Cannot find module './breakdown'`.

- [ ] **Step 1.3: Write minimal implementation**

Create `src/lib/usage/breakdown.ts`:

```ts
export interface UsageEventRow {
  source: "trial" | "quota" | "overage";
  units: number;
}

export interface MonthlyBreakdown {
  trial: number;
  quota: number;
  overage: number;
}

export function computeBreakdown(rows: UsageEventRow[]): MonthlyBreakdown {
  const acc: MonthlyBreakdown = { trial: 0, quota: 0, overage: 0 };
  for (const row of rows) {
    if (row.source === "trial" || row.source === "quota" || row.source === "overage") {
      acc[row.source] += Number(row.units);
    }
  }
  return acc;
}
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `pnpm test src/lib/usage/breakdown.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/usage/breakdown.ts src/lib/usage/breakdown.test.ts
git commit -m "feat(billing): add computeBreakdown helper for monthly usage by source"
```

---

## Task 2: Extend `CloudContext` with breakdown fetch

**Files:**
- Modify: `src/contexts/CloudContext.tsx`

- [ ] **Step 2.1: Add `MonthlyBreakdown` to context value**

Open `src/contexts/CloudContext.tsx`. At the top of the file, after the existing `UsagePlan` interface (around line 18), import and re-export the breakdown types:

```ts
import type { MonthlyBreakdown } from "@/lib/usage/breakdown";
import { computeBreakdown } from "@/lib/usage/breakdown";
```

Then add `monthly_minutes_breakdown` to the `CloudContextValue` interface (around line 20-39). Insert after `monthly_minutes_used`:

```ts
  monthly_minutes_used: number;
  monthly_minutes_breakdown: MonthlyBreakdown;
  plan: UsagePlan | null;
```

Update the default `createContext(...)` call (around line 47-56) to include the new field:

```ts
const DEFAULT_BREAKDOWN: MonthlyBreakdown = { trial: 0, quota: 0, overage: 0 };

export const CloudContext = createContext<CloudContextValue>({
  mode: "uninitialized",
  isCloudEligible: false,
  hasCloudSelected: false,
  trial: DEFAULT_TRIAL,
  monthly_minutes_used: 0,
  monthly_minutes_breakdown: DEFAULT_BREAKDOWN,
  plan: null,
  usageLoading: false,
  refreshUsage: async () => {},
});
```

- [ ] **Step 2.2: Add breakdown state inside `CloudProvider`**

Around line 67-71 where state is declared, add:

```ts
  const [monthlyBreakdown, setMonthlyBreakdown] =
    useState<MonthlyBreakdown>(DEFAULT_BREAKDOWN);
```

- [ ] **Step 2.3: Add a UTC month-bounds helper**

After the existing `currentYearMonth` helper (around line 58-61), add:

```ts
function currentMonthBoundsUtc(): { start: string; end: string } {
  const d = new Date();
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}
```

- [ ] **Step 2.4: Add the 4th fetch + aggregation in `refreshUsage`**

In `refreshUsage` (around line 75-119), modify the `Promise.all` block to also fetch usage events for the current month. Replace the existing `Promise.all` and the post-processing with:

```ts
    setUsageLoading(true);
    try {
      const ym = currentYearMonth();
      const { start, end } = currentMonthBoundsUtc();
      const [
        { data: trialData },
        { data: usage },
        { data: sub },
        { data: events },
      ] = await Promise.all([
        supabase.from("trial_status").select("*").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("usage_summary")
          .select("units_total")
          .eq("user_id", user.id)
          .eq("year_month", ym)
          .eq("kind", "transcription")
          .maybeSingle(),
        supabase
          .from("subscriptions")
          .select("plan, quota_minutes, status")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("usage_events")
          .select("source, units")
          .eq("user_id", user.id)
          .eq("kind", "transcription")
          .gte("created_at", start)
          .lt("created_at", end),
      ]);

      const t: TrialStatus = {
        is_active: Boolean(trialData?.is_active),
        minutes_remaining: Number(trialData?.minutes_remaining ?? 0),
        expires_at: (trialData?.expires_at as string) ?? null,
      };
      setTrial(t);
      setMonthlyUsed(Number(usage?.units_total ?? 0));
      setMonthlyBreakdown(computeBreakdown(events ?? []));
      setPlan(
        sub && sub.status === "active"
          ? { quota_minutes: Number(sub.quota_minutes), plan: sub.plan as "starter" | "pro" }
          : null,
      );
      setEligible(t.is_active || sub?.status === "active");
    } finally {
      setUsageLoading(false);
    }
```

Also reset `monthlyBreakdown` to `DEFAULT_BREAKDOWN` in the early-return path when there's no user (around line 76-83):

```ts
    if (!user) {
      setTrial(DEFAULT_TRIAL);
      setMonthlyUsed(0);
      setMonthlyBreakdown(DEFAULT_BREAKDOWN);
      setPlan(null);
      setEligible(false);
      setUsageLoading(false);
      return;
    }
```

- [ ] **Step 2.5: Expose `monthly_minutes_breakdown` in the memoized value**

Around line 145-157, add the field to the `useMemo` value and dependencies:

```ts
  const value = useMemo<CloudContextValue>(
    () => ({
      mode,
      isCloudEligible: eligible,
      hasCloudSelected,
      trial,
      monthly_minutes_used: monthlyUsed,
      monthly_minutes_breakdown: monthlyBreakdown,
      plan,
      usageLoading,
      refreshUsage,
    }),
    [
      mode,
      eligible,
      hasCloudSelected,
      trial,
      monthlyUsed,
      monthlyBreakdown,
      plan,
      usageLoading,
      refreshUsage,
    ],
  );
```

- [ ] **Step 2.6: Type-check the change**

Run: `pnpm tsc --noEmit`
Expected: no errors related to `CloudContext`. (Other unrelated errors, if any, must be pre-existing — check `git stash && pnpm tsc --noEmit` if unsure.)

- [ ] **Step 2.7: Run existing test suite (regression)**

Run: `pnpm test`
Expected: all tests still pass. No tests should reference `CloudContext` directly today; if any do, they may need a stub `monthly_minutes_breakdown` — fix inline.

- [ ] **Step 2.8: Commit**

```bash
git add src/contexts/CloudContext.tsx
git commit -m "feat(billing): expose monthly_minutes_breakdown from CloudContext"
```

---

## Task 3: Expose breakdown via `useUsage`

**Files:**
- Modify: `src/hooks/useUsage.ts`

- [ ] **Step 3.1: Add `monthly_minutes_breakdown` to the hook's return type and value**

Replace the entire content of `src/hooks/useUsage.ts` with:

```ts
import { useContext } from "react";
import {
  CloudContext,
  type TrialStatus,
  type UsagePlan,
} from "@/contexts/CloudContext";
import type { MonthlyBreakdown } from "@/lib/usage/breakdown";

interface UsageData {
  trial: TrialStatus;
  monthly_minutes_used: number;
  monthly_minutes_breakdown: MonthlyBreakdown;
  plan: UsagePlan | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Thin selector over CloudContext. The actual fetch lives in CloudProvider so
 * QuotaCounter (header) and CloudSection (settings) share one set of round-trips.
 */
export function useUsage(): UsageData {
  const ctx = useContext(CloudContext);
  return {
    trial: ctx.trial,
    monthly_minutes_used: ctx.monthly_minutes_used,
    monthly_minutes_breakdown: ctx.monthly_minutes_breakdown,
    plan: ctx.plan,
    loading: ctx.usageLoading,
    refresh: ctx.refreshUsage,
  };
}
```

- [ ] **Step 3.2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3.3: Commit**

```bash
git add src/hooks/useUsage.ts
git commit -m "feat(billing): forward monthly_minutes_breakdown through useUsage"
```

---

## Task 4: Add new i18n keys (FR + EN)

**Files:**
- Modify: `src/locales/fr/cloud.json`
- Modify: `src/locales/en/cloud.json`

- [ ] **Step 4.1: Update FR locale**

Open `src/locales/fr/cloud.json`. Replace the entire `"settings"` block with:

```json
  "settings": {
    "heading": "Service cloud Lexena",
    "signin_required": "Connectez-vous pour accéder au service cloud.",
    "loading": "Chargement…",
    "nothing_active": "Aucun essai ni abonnement actif. La transcription cloud est désactivée.",
    "refresh": "Rafraîchir",
    "plan": {
      "heading": "Plan {{plan}}",
      "minutes_progress": "Minutes ce mois",
      "minutes_progress_value": "{{used}} / {{quota}}"
    },
    "bonus": {
      "heading": "Bonus de bienvenue",
      "minutes_remaining_one": "{{count}} min restante · expire le {{date}}",
      "minutes_remaining_other": "{{count}} min restantes · expire le {{date}}",
      "consumed_first_note": "Consommées en priorité avant ton plan.",
      "minutes_remaining_standalone_one": "{{count}} min restante",
      "minutes_remaining_standalone_other": "{{count}} min restantes",
      "expires_at": "Expire le {{date}}"
    },
    "section": {
      "plan_title": "Abonnement",
      "current_plan": "Plan {{tier}} — {{quota}} minutes incluses par mois",
      "manage_cta": "Gérer mon abonnement"
    }
  },
```

The `_standalone` and `expires_at` keys cover the "trial seul" state (when there's no plan to anchor the bonus to — see Task 5 layout for that branch).

- [ ] **Step 4.2: Update EN locale**

Open `src/locales/en/cloud.json`. Replace the entire `"settings"` block with:

```json
  "settings": {
    "heading": "Lexena cloud service",
    "signin_required": "Sign in to access the cloud service.",
    "loading": "Loading…",
    "nothing_active": "No active trial or subscription. Cloud transcription is disabled.",
    "refresh": "Refresh",
    "plan": {
      "heading": "{{plan}} plan",
      "minutes_progress": "Minutes this month",
      "minutes_progress_value": "{{used}} / {{quota}}"
    },
    "bonus": {
      "heading": "Welcome bonus",
      "minutes_remaining_one": "{{count}} min left · expires on {{date}}",
      "minutes_remaining_other": "{{count}} min left · expires on {{date}}",
      "consumed_first_note": "Consumed before your plan minutes.",
      "minutes_remaining_standalone_one": "{{count}} min left",
      "minutes_remaining_standalone_other": "{{count}} min left",
      "expires_at": "Expires on {{date}}"
    },
    "section": {
      "plan_title": "Subscription",
      "current_plan": "{{tier}} plan — {{quota}} minutes included per month",
      "manage_cta": "Manage subscription"
    }
  },
```

- [ ] **Step 4.3: Verify the JSON parses**

Run: `pnpm tsc --noEmit` (also implicitly validates JSON imports if done via `resolveJsonModule`)

Or run a focused check:

```bash
node -e "JSON.parse(require('fs').readFileSync('src/locales/fr/cloud.json','utf8'));JSON.parse(require('fs').readFileSync('src/locales/en/cloud.json','utf8'));console.log('ok')"
```

Expected: prints `ok`.

- [ ] **Step 4.4: Commit**

```bash
git add src/locales/fr/cloud.json src/locales/en/cloud.json
git commit -m "feat(i18n): add cloud bonus + plan progress keys, drop old trial keys"
```

---

## Task 5: Refactor `CloudSection` (TDD)

**Files:**
- Create: `src/components/settings/sections/CloudSection.test.tsx`
- Modify: `src/components/settings/sections/CloudSection.tsx`

- [ ] **Step 5.1: Write the failing test**

Create `src/components/settings/sections/CloudSection.test.tsx`:

```tsx
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

import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CloudSection } from "./CloudSection";
import type { TrialStatus, UsagePlan } from "@/contexts/CloudContext";
import type { MonthlyBreakdown } from "@/lib/usage/breakdown";

const mockUseUsage = vi.fn();
const mockUseAuth = vi.fn();

vi.mock("@/hooks/useUsage", () => ({
  useUsage: () => mockUseUsage(),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));
vi.mock("@/components/billing/SubscribeButton", () => ({
  SubscribeButton: () => <button data-testid="subscribe-button">subscribe</button>,
}));

interface UsageState {
  trial: TrialStatus;
  monthly_minutes_used: number;
  monthly_minutes_breakdown: MonthlyBreakdown;
  plan: UsagePlan | null;
  loading: boolean;
  refresh: () => Promise<void>;
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
});

afterEach(() => {
  cleanup();
  mockUseUsage.mockReset();
});

describe("CloudSection", () => {
  it("shows signin_required when no user", () => {
    mockUseAuth.mockReturnValue({ user: null });
    setUsage({});
    render(<CloudSection />);
    expect(screen.getByText(/connectez-vous/i)).toBeInTheDocument();
  });

  it("shows loading state", () => {
    setUsage({ loading: true });
    render(<CloudSection />);
    expect(screen.getByText(/chargement/i)).toBeInTheDocument();
  });

  it("renders Plan block with bonus subblock when both trial and plan are active", () => {
    setUsage({
      trial: {
        is_active: true,
        minutes_remaining: 49,
        expires_at: "2026-06-03T19:57:01Z",
      },
      plan: { plan: "starter", quota_minutes: 400 },
      monthly_minutes_used: 5,
      monthly_minutes_breakdown: { trial: 5, quota: 0, overage: 0 },
    });
    render(<CloudSection />);

    // Plan block headline + counter use breakdown.quota (0), NOT monthly_minutes_used (5)
    expect(screen.getByText(/plan starter/i)).toBeInTheDocument();
    expect(screen.getByText("0 / 400")).toBeInTheDocument();

    // Bonus subblock visible with explicit ordering note
    expect(screen.getByText(/bonus de bienvenue/i)).toBeInTheDocument();
    expect(screen.getByText(/49 min restantes/i)).toBeInTheDocument();
    expect(screen.getByText(/consommées en priorité avant ton plan/i)).toBeInTheDocument();
  });

  it("renders Plan block alone when trial is expired", () => {
    setUsage({
      trial: { is_active: false, minutes_remaining: 0, expires_at: null },
      plan: { plan: "starter", quota_minutes: 400 },
      monthly_minutes_breakdown: { trial: 0, quota: 27, overage: 0 },
    });
    render(<CloudSection />);
    expect(screen.getByText(/plan starter/i)).toBeInTheDocument();
    expect(screen.getByText("27 / 400")).toBeInTheDocument();
    expect(screen.queryByText(/bonus de bienvenue/i)).not.toBeInTheDocument();
  });

  it("renders bonus block + Subscribe CTA when trial active and no plan", () => {
    setUsage({
      trial: {
        is_active: true,
        minutes_remaining: 49,
        expires_at: "2026-06-03T19:57:01Z",
      },
      plan: null,
    });
    render(<CloudSection />);
    expect(screen.getByText(/bonus de bienvenue/i)).toBeInTheDocument();
    expect(screen.queryByText(/consommées en priorité/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("subscribe-button")).toBeInTheDocument();
  });

  it("shows nothing_active when neither trial nor plan", () => {
    setUsage({});
    render(<CloudSection />);
    expect(screen.getByText(/aucun essai ni abonnement actif/i)).toBeInTheDocument();
    expect(screen.getByTestId("subscribe-button")).toBeInTheDocument();
  });
});
```

- [ ] **Step 5.2: Run test to verify it fails**

Run: `pnpm test src/components/settings/sections/CloudSection.test.tsx`
Expected: FAIL — likely on the assertion `screen.getByText("0 / 400")` (current implementation shows separate `400` / `5` / `395` rows, not the new `used / quota` counter).

- [ ] **Step 5.3: Rewrite `CloudSection.tsx`**

Replace the entire content of `src/components/settings/sections/CloudSection.tsx` with:

```tsx
import { useTranslation } from "react-i18next";
import { useUsage } from "@/hooks/useUsage";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { SubscribeButton } from "@/components/billing/SubscribeButton";

const LEMON_SQUEEZY_PORTAL_URL =
  (import.meta.env.VITE_LEMON_SQUEEZY_PORTAL_URL as string | undefined) ??
  "https://app.lemonsqueezy.com/my-orders";

function formatExpiry(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString();
}

export function CloudSection() {
  const { t } = useTranslation("cloud");
  const { user } = useAuth();
  const { trial, monthly_minutes_breakdown, plan, loading, refresh } = useUsage();

  if (!user) {
    return (
      <div id="section-cloud" className="vt-anim-fade-up space-y-5">
        <p className="text-sm text-muted-foreground">{t("settings.signin_required")}</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div id="section-cloud" className="vt-anim-fade-up space-y-5">
        <p className="text-sm text-muted-foreground">{t("settings.loading")}</p>
      </div>
    );
  }

  const usedQuota = Math.floor(monthly_minutes_breakdown.quota);
  const trialMinutesLeft = Math.floor(trial.minutes_remaining);
  const expiryLabel = formatExpiry(trial.expires_at);

  return (
    <div id="section-cloud" className="vt-anim-fade-up space-y-5">
      <div className="vt-card-sectioned" style={{ overflow: "hidden" }}>
        <div className="vt-row flex flex-col gap-4 py-5">
          <h2 className="text-[15px] font-semibold tracking-tight">
            {t("settings.heading")}
          </h2>

          {plan && (
            <section className="space-y-3">
              <h3 className="text-[13px] font-semibold">
                {t("settings.plan.heading", { plan: plan.plan })}
              </h3>
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="text-muted-foreground">
                  {t("settings.plan.minutes_progress")}
                </span>
                <span className="vt-mono">
                  {t("settings.plan.minutes_progress_value", {
                    used: usedQuota,
                    quota: plan.quota_minutes,
                  })}
                </span>
              </div>
              <div
                className="h-1.5 w-full rounded-full bg-muted overflow-hidden"
                role="progressbar"
                aria-valuenow={usedQuota}
                aria-valuemin={0}
                aria-valuemax={plan.quota_minutes}
              >
                <div
                  className="h-full bg-primary"
                  style={{
                    width: `${Math.min((usedQuota / Math.max(plan.quota_minutes, 1)) * 100, 100)}%`,
                  }}
                />
              </div>

              {trial.is_active && (
                <div className="mt-2 border-t pt-3 space-y-1">
                  <p className="text-[12.5px] font-medium">{t("settings.bonus.heading")}</p>
                  <p className="text-[12.5px] text-muted-foreground">
                    {t("settings.bonus.minutes_remaining", {
                      count: trialMinutesLeft,
                      date: expiryLabel,
                    })}
                  </p>
                  <p className="text-[12px] text-muted-foreground italic">
                    {t("settings.bonus.consumed_first_note")}
                  </p>
                </div>
              )}
            </section>
          )}

          {!plan && trial.is_active && (
            <section className="space-y-2">
              <h3 className="text-[13px] font-semibold">{t("settings.bonus.heading")}</h3>
              <p className="text-[12.5px] text-muted-foreground">
                {t("settings.bonus.minutes_remaining_standalone", {
                  count: trialMinutesLeft,
                })}
              </p>
              <p className="text-[12.5px] text-muted-foreground">
                {t("settings.bonus.expires_at", { date: expiryLabel })}
              </p>
            </section>
          )}

          {!plan && !trial.is_active && (
            <p className="text-sm text-muted-foreground">{t("settings.nothing_active")}</p>
          )}

          <section className="space-y-3 border-t pt-5">
            <h3 className="text-[13px] font-semibold">
              {t("settings.section.plan_title")}
            </h3>
            {plan ? (
              <div className="rounded-md border p-4 text-sm">
                <p>
                  {t("settings.section.current_plan", {
                    tier: plan.plan,
                    quota: plan.quota_minutes,
                  })}
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <a
                    href={LEMON_SQUEEZY_PORTAL_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("settings.section.manage_cta")}
                  </a>
                </Button>
              </div>
            ) : (
              <SubscribeButton />
            )}
          </section>

          <div>
            <button onClick={() => refresh()} className="vt-btn">
              {t("settings.refresh")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5.4: Run tests to verify they pass**

Run: `pnpm test src/components/settings/sections/CloudSection.test.tsx`
Expected: PASS — 5 tests.

- [ ] **Step 5.5: Run full test suite for regressions**

Run: `pnpm test`
Expected: all tests pass (the i18n keys removed in Task 4 should no longer be referenced — if any other component breaks, fix it inline before committing).

- [ ] **Step 5.6: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 5.7: Commit**

```bash
git add src/components/settings/sections/CloudSection.tsx src/components/settings/sections/CloudSection.test.tsx
git commit -m "feat(billing): hierarchize cloud section with plan + welcome bonus subblock"
```

---

## Task 6: Fix `QuotaCounter` calc (TDD)

**Files:**
- Create: `src/components/cloud/QuotaCounter.test.tsx`
- Modify: `src/components/cloud/QuotaCounter.tsx`

- [ ] **Step 6.1: Write the failing test**

Create `src/components/cloud/QuotaCounter.test.tsx`:

```tsx
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
```

- [ ] **Step 6.2: Run test to verify it fails**

Run: `pnpm test src/components/cloud/QuotaCounter.test.tsx`
Expected: FAIL — at least the test "computes plan remaining from breakdown.quota" should fail because the current code uses `monthly_minutes_used`.

- [ ] **Step 6.3: Patch `QuotaCounter.tsx`**

Open `src/components/cloud/QuotaCounter.tsx`. Replace the destructure on line 16:

```ts
  const { trial, monthly_minutes_used, plan, loading } = useUsage();
```

with:

```ts
  const { trial, monthly_minutes_breakdown, plan, loading } = useUsage();
```

Then replace line 39:

```ts
    const remaining = Math.max(plan.quota_minutes - monthly_minutes_used, 0);
```

with:

```ts
    const remaining = Math.max(
      plan.quota_minutes - Math.floor(monthly_minutes_breakdown.quota),
      0,
    );
```

- [ ] **Step 6.4: Run tests to verify they pass**

Run: `pnpm test src/components/cloud/QuotaCounter.test.tsx`
Expected: PASS — 5 tests.

- [ ] **Step 6.5: Type-check + full test suite**

Run: `pnpm tsc --noEmit && pnpm test`
Expected: all green.

- [ ] **Step 6.6: Commit**

```bash
git add src/components/cloud/QuotaCounter.tsx src/components/cloud/QuotaCounter.test.tsx
git commit -m "fix(billing): QuotaCounter plan remaining now ignores trial usage"
```

---

## Task 7: Verify no orphan references to old i18n keys

**Files:** none modified (verification only).

- [ ] **Step 7.1: Grep for old key paths**

Run:

```bash
grep -rn "settings\.trial\.heading\|settings\.trial\.minutes_remaining\|settings\.trial\.expires_at\|settings\.plan\.quota_minutes\|settings\.plan\.minutes_used\|settings\.plan\.minutes_remaining" src/
```

Expected: zero output. The old keys were used only by `CloudSection.tsx` (now rewritten).

- [ ] **Step 7.2: If matches found, fix them**

If anything matches (in another component we missed), update it to the new key set:
- `settings.trial.*` → `settings.bonus.*`
- `settings.plan.quota_minutes` → display via `settings.plan.minutes_progress_value`
- `settings.plan.minutes_used` / `minutes_remaining` → derived from `breakdown.quota` and `plan.quota_minutes`

Re-run grep to confirm zero matches, then commit the fix in a separate commit:

```bash
git commit -am "fix(i18n): migrate orphan cloud locale references to new keys"
```

If no matches in Step 7.1, skip Step 7.2 entirely.

---

## Task 8: Manual smoke test

**Files:** none.

- [ ] **Step 8.1: Ask the user to launch the dev server**

Per project rule (CLAUDE.md), `pnpm tauri dev` is not allowed for the agent — request the user to run it.

Suggest message: "Lance `pnpm tauri dev` puis va dans Settings → Cloud avec un compte ayant à la fois un trial actif (49 min restantes par exemple) et une subscription starter active. Tu devrais voir un bloc unique 'Plan starter' avec compteur `0 / 400` et un sous-bloc 'Bonus de bienvenue · 49 min restantes · expire le …' avec la note 'Consommées en priorité avant ton plan.'"

- [ ] **Step 8.2: Verify each state matches the spec layout**

Checklist for the user:
1. ✅ Trial actif + plan actif → Plan card avec sous-bloc bonus
2. ✅ Trial expiré + plan actif → Plan card seule
3. ✅ Trial actif sans plan → Bonus card + bouton souscrire
4. ✅ Aucun → message `nothing_active`
5. ✅ Header pill (`QuotaCounter`) cohérent avec le bloc bonus si trial actif, sinon avec le compteur Plan corrigé.

- [ ] **Step 8.3: If all manual checks pass, no further commit**

The smoke test is for validation only — no artifact to commit.

---

## Self-Review (executed by plan author)

### 1. Spec coverage check

| Spec section | Covered by |
|---|---|
| Architecture: 3 fichiers modifiés | Tasks 2, 5, 6 (CloudContext, CloudSection, QuotaCounter) |
| Architecture: 2 fichiers étendus (i18n) | Task 4 |
| Architecture: 3 fichiers nouveaux (tests) | Tasks 1, 5, 6 |
| Layout cible (Plan + bonus) | Task 5 (test #3 + impl) |
| États "Trial seul" / "Plan seul" / "Rien" | Task 5 (tests #4, #5, #6) |
| Contrat `MonthlyBreakdown` | Tasks 1, 2, 3 |
| Calcul UI `breakdown.quota / quota_minutes` | Task 5 (impl + test #3) |
| Calcul `QuotaCounter` corrigé | Task 6 (test #2 + impl) |
| i18n FR + EN nouvelles clés | Task 4 |
| Suppression anciennes clés `settings.trial.*` | Task 4 + verification Task 7 |
| Cas limite : trial expire mid-month | Task 5 (test #4) + Task 6 (test #3) |
| Cas limite : `paused`/`past_due`/`cancelled` | Inchangé (CloudContext filtre déjà status='active'); pas de test dédié — comportement déjà couvert par "trial seul" et "Rien" |
| Cas limite : overage | Hors scope (spec §4) — barre clampée naturellement à 100% par `Math.min(..., 100)` dans Task 5 step 5.3 |
| Test `computeBreakdown` | Task 1 |
| Test `CloudSection` | Task 5 |
| Test `QuotaCounter` | Task 6 |

Tous les éléments du spec sont couverts.

### 2. Placeholder scan

Aucun "TBD"/"TODO"/"add appropriate handling". Tous les snippets de code sont complets.

### 3. Type consistency

- `MonthlyBreakdown` défini dans Task 1, utilisé par `CloudContext` (Task 2), `useUsage` (Task 3), `CloudSection` (Task 5), `QuotaCounter` (Task 6). Signature stable.
- `monthly_minutes_breakdown` (snake_case) cohérent partout.
- `usedQuota` calculé via `Math.floor(monthly_minutes_breakdown.quota)` dans Task 5 step 5.3 et Task 6 step 6.3 — cohérent.
- Clés i18n `settings.bonus.minutes_remaining`, `settings.bonus.consumed_first_note`, `settings.bonus.minutes_remaining_standalone`, `settings.bonus.expires_at`, `settings.plan.minutes_progress`, `settings.plan.minutes_progress_value` toutes définies en Task 4 et toutes utilisées en Task 5.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-09-cloud-section-trial-plan-hierarchy.md`. Two execution options:

**1. Subagent-Driven (recommended)** — un subagent neuf par tâche, review entre chaque, itération rapide.

**2. Inline Execution** — j'exécute les tâches dans cette session avec checkpoints batchés.

Quelle approche ?
