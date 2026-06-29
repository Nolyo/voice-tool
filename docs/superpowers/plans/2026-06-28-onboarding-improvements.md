# Onboarding Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make first-run clearer by adding a microphone picker + skip button to the wizard's demo step, and add a one-pass guided tour (coach marks) that explains the main UI after onboarding.

**Architecture:** Two independent workstreams. (A) Small edits to `TryItStep` + `OnboardingFlow`. (B) A custom, dependency-free guided-tour engine: a pure `useGuidedTour` hook (testable sequencing) + a `GuidedTour` portal component (spotlight via a giant `box-shadow`, bubble styled with `.vt-app` tokens), driven by a declarative `TOUR_STEPS` list anchored to `data-tour` attributes on always-visible Accueil-tab elements. A new `tour_pending` settings flag (default `false`) triggers the tour exactly once after a fresh wizard completion.

**Tech Stack:** React 19, TypeScript, Tailwind v4 + `.vt-app` OKLCH tokens, Radix primitives, react-i18next, Vitest + jsdom, Tauri (`get_audio_devices` command already exists).

## Global Constraints

- No new runtime dependency (custom tour engine; reuse Radix + existing UI primitives).
- Never break existing dependencies/features (no `cargo update`, no feature flag changes).
- No hardcoded UI strings — every visible string goes through react-i18next, in **both** `fr` and `en`.
- i18n namespaces (verified): tour strings + replay button → **default** namespace files `src/locales/fr.json` + `src/locales/en.json` under a top-level `tour` key. Mic-picker label + skip link → **billing** namespace files `src/locales/fr/billing.json` + `src/locales/en/billing.json` under `welcome.try.*`.
- `tour_pending` defaults to `false` so existing beta users never get a surprise tour on update.
- The tour must not drive tab navigation; it only points at elements always visible on the Accueil tab.
- Branch: `feat/onboarding-improvements` (already created). Never commit to `main`.
- Test command: `pnpm test` (= `vitest run`); single file: `pnpm test <path>`. Typecheck: `pnpm exec tsc --noEmit`. Full build: `pnpm build`.
- Commit style: conventional commits, English (`feat:`, `test:`, `chore:`...).

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/components/onboarding/steps/TryItStep.tsx` | (modify) mic picker + skip link | 1 |
| `src/components/onboarding/OnboardingFlow.tsx` | (modify) wire `onSkip`; set `tour_pending` on complete | 1, 6 |
| `src/locales/fr/billing.json`, `src/locales/en/billing.json` | (modify) `welcome.try.device_*` + `welcome.try.cta_skip` | 1 |
| `src/lib/settings.ts` | (modify) add `tour_pending` flag + default | 2 |
| `src/lib/settings.test.ts` | (create) lock the `tour_pending=false` default | 2 |
| `src/hooks/useGuidedTour.ts` | (create) pure step sequencing | 3 |
| `src/hooks/useGuidedTour.test.ts` | (create) sequencing tests | 3 |
| `src/components/onboarding/tour/tourSteps.ts` | (create) `TOUR_STEPS` + `shouldShowGuidedTour` | 4 |
| `src/components/onboarding/tour/tourSteps.test.ts` | (create) steps shape + trigger truth table | 4 |
| `src/locales/fr.json`, `src/locales/en.json` | (modify) `tour.*` keys | 4, 6 |
| `src/components/onboarding/tour/GuidedTour.tsx` | (create) portal spotlight + bubble | 5 |
| `src/components/onboarding/tour/GuidedTour.test.tsx` | (create) smoke + skip test | 5 |
| `src/components/dashboard/home/HeroDictationCard.tsx` | (modify) `data-tour="hero-dictation"` | 6 |
| `src/components/dashboard/DashboardSidebar.tsx` | (modify) `data-tour` on nav buttons + profile wrapper | 6 |
| `src/components/Dashboard.tsx` | (modify) mount `GuidedTour` behind the trigger gate | 6 |
| `src/components/settings/sections/AppearanceSection.tsx` | (modify) "Replay tour" button | 6 |

---

## Task 1: Wizard — microphone picker + skip button (workstream A)

Independent of the tour; can ship first. Adds a device `Select` to the demo step and a "Skip this step" link that jumps to the cloud-vs-local Choice step (without escaping the wizard).

**Files:**
- Modify: `src/components/onboarding/steps/TryItStep.tsx`
- Modify: `src/components/onboarding/OnboardingFlow.tsx`
- Modify: `src/locales/fr/billing.json`, `src/locales/en/billing.json`

**Interfaces:**
- Consumes: `useAudioDevices()` → `{ devices: { name: string; index: number; is_default: boolean }[] }`; `useSettings()` → `{ settings, updateSetting }`; existing `Select*` from `@/components/ui/select`.
- Produces: `TryItStep` gains a required `onSkip: () => void` prop.

- [ ] **Step 1: Add the i18n keys (billing namespace, both languages)**

In `src/locales/fr/billing.json`, inside the existing `"welcome": { "try": { ... } }` object, add:

```json
"device_label": "Microphone",
"device_default": "Périphérique par défaut",
"cta_skip": "Passer cette étape"
```

In `src/locales/en/billing.json`, inside `welcome.try`, add:

```json
"device_label": "Microphone",
"device_default": "Default device",
"cta_skip": "Skip this step"
```

- [ ] **Step 2: Add `onSkip` to the props and import the picker deps**

In `src/components/onboarding/steps/TryItStep.tsx`, update the imports and props:

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAudioDevices } from "@/hooks/useAudioDevices";
```

Change the props interface and destructuring:

```tsx
interface TryItStepProps {
  onCloud: () => void;
  onLocal: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export function TryItStep({ onCloud, onLocal, onBack, onSkip }: TryItStepProps) {
  const { t, i18n } = useTranslation("billing");
  const { settings, updateSetting } = useSettings();
  const { devices } = useAudioDevices();
```

- [ ] **Step 3: Render the device picker above the demo card**

Still in `TryItStep.tsx`, add this block immediately after the closing `</div>` of the title section (the `<div className="space-y-2 text-center">…</div>`) and before the demo card `<div className="flex min-h-[220px] …">`:

```tsx
{(phase.status === "idle" || phase.status === "error") && devices.length > 0 && (
  <div className="mx-auto flex w-full max-w-xs flex-col gap-1.5">
    <label
      className="text-xs font-medium"
      style={{ color: "var(--vt-fg-3)" }}
    >
      {t("welcome.try.device_label")}
    </label>
    <Select
      value={
        settings.input_device_index == null
          ? "default"
          : String(settings.input_device_index)
      }
      onValueChange={(val) =>
        void updateSetting(
          "input_device_index",
          val === "default" ? null : Number(val),
        )
      }
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="default">
          {t("welcome.try.device_default")}
        </SelectItem>
        {devices.map((d) => (
          <SelectItem key={d.index} value={String(d.index)}>
            {d.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)}
```

- [ ] **Step 4: Add the "Skip this step" link to the idle footer**

Still in `TryItStep.tsx`, replace the `idle`-state footer block:

```tsx
{phase.status === "idle" && (
  <div className="flex items-center justify-between gap-3">
    <Button variant="ghost" onClick={onBack} className="gap-2">
      <ArrowLeft className="h-4 w-4" />
      {t("welcome.try.cta_back")}
    </Button>
  </div>
)}
```

with:

```tsx
{phase.status === "idle" && (
  <div className="flex items-center justify-between gap-3">
    <Button variant="ghost" onClick={onBack} className="gap-2">
      <ArrowLeft className="h-4 w-4" />
      {t("welcome.try.cta_back")}
    </Button>
    <button
      type="button"
      onClick={onSkip}
      className="text-sm underline-offset-4 hover:underline"
      style={{ color: "var(--vt-fg-3)" }}
    >
      {t("welcome.try.cta_skip")}
    </button>
  </div>
)}
```

- [ ] **Step 5: Wire `onSkip` in `OnboardingFlow`**

In `src/components/onboarding/OnboardingFlow.tsx`, update the step-3 render:

```tsx
{step === 3 && (
  <TryItStep
    onBack={() => setStep(2)}
    onCloud={handleCloud}
    onLocal={handleLocal}
    onSkip={() => setStep(4)}
  />
)}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 7: Commit**

```bash
git add src/components/onboarding/steps/TryItStep.tsx src/components/onboarding/OnboardingFlow.tsx src/locales/fr/billing.json src/locales/en/billing.json
git commit -m "feat: add mic picker and skip button to onboarding demo step"
```

---

## Task 2: Settings — `tour_pending` flag (workstream B foundation)

**Files:**
- Modify: `src/lib/settings.ts:76-77` (interface), `src/lib/settings.ts:159-160` (defaults)
- Create: `src/lib/settings.test.ts`

**Interfaces:**
- Produces: `AppSettings["settings"].tour_pending: boolean` (default `false`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/settings.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings } from "./settings";

describe("tour_pending setting", () => {
  it("defaults to false so existing users get no surprise tour on update", () => {
    expect(DEFAULT_SETTINGS.settings.tour_pending).toBe(false);
  });

  it("mergeSettings preserves an explicit tour_pending=true", () => {
    const merged = mergeSettings({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      settings: { tour_pending: true } as any,
    });
    expect(merged.settings.tour_pending).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/settings.test.ts`
Expected: FAIL — `DEFAULT_SETTINGS.settings.tour_pending` is `undefined`.

- [ ] **Step 3: Add the flag to the interface**

In `src/lib/settings.ts`, in the `// Onboarding` block of the interface:

```ts
    // Onboarding
    onboarding_completed: boolean;
    /** True for exactly one fresh wizard completion → triggers the guided tour once. */
    tour_pending: boolean;
```

- [ ] **Step 4: Add the default**

In `src/lib/settings.ts`, in the `// Onboarding` block of `DEFAULT_SETTINGS.settings`:

```ts
    // Onboarding
    onboarding_completed: false,
    tour_pending: false,
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test src/lib/settings.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 6: Commit**

```bash
git add src/lib/settings.ts src/lib/settings.test.ts
git commit -m "feat: add tour_pending settings flag for guided tour trigger"
```

---

## Task 3: `useGuidedTour` hook (pure sequencing)

**Files:**
- Create: `src/hooks/useGuidedTour.ts`
- Create: `src/hooks/useGuidedTour.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface GuidedTourController {
    index: number; total: number;
    isFirst: boolean; isLast: boolean;
    next: () => void; prev: () => void; reset: () => void;
  }
  function useGuidedTour(total: number, onFinish: () => void): GuidedTourController
  ```
  `next()` past the last step calls `onFinish()` and clamps; `prev()` clamps at 0.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useGuidedTour.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useGuidedTour } from "./useGuidedTour";

describe("useGuidedTour", () => {
  it("starts at index 0", () => {
    const { result } = renderHook(() => useGuidedTour(3, vi.fn()));
    expect(result.current.index).toBe(0);
    expect(result.current.isFirst).toBe(true);
    expect(result.current.isLast).toBe(false);
  });

  it("advances with next() and clamps isLast", () => {
    const { result } = renderHook(() => useGuidedTour(3, vi.fn()));
    act(() => result.current.next());
    expect(result.current.index).toBe(1);
    act(() => result.current.next());
    expect(result.current.index).toBe(2);
    expect(result.current.isLast).toBe(true);
  });

  it("calls onFinish when next() is invoked on the last step and does not overflow", () => {
    const onFinish = vi.fn();
    const { result } = renderHook(() => useGuidedTour(2, onFinish));
    act(() => result.current.next()); // → index 1 (last)
    act(() => result.current.next()); // → onFinish, stays at 1
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(result.current.index).toBe(1);
  });

  it("prev() decrements and clamps at 0", () => {
    const { result } = renderHook(() => useGuidedTour(3, vi.fn()));
    act(() => result.current.next());
    act(() => result.current.prev());
    expect(result.current.index).toBe(0);
    act(() => result.current.prev());
    expect(result.current.index).toBe(0);
  });

  it("reset() returns to 0", () => {
    const { result } = renderHook(() => useGuidedTour(3, vi.fn()));
    act(() => result.current.next());
    act(() => result.current.reset());
    expect(result.current.index).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/hooks/useGuidedTour.test.ts`
Expected: FAIL — module `./useGuidedTour` not found.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useGuidedTour.ts`:

```ts
import { useCallback, useState } from "react";

export interface GuidedTourController {
  index: number;
  total: number;
  isFirst: boolean;
  isLast: boolean;
  next: () => void;
  prev: () => void;
  reset: () => void;
}

/**
 * Pure step-sequencing for the guided tour. Holds the current index and clamps
 * at both ends. `next()` past the final step triggers `onFinish` (used both for
 * the "Done" button on the last step and for any auto-advance). All DOM /
 * positioning concerns live in the GuidedTour presentation layer.
 */
export function useGuidedTour(
  total: number,
  onFinish: () => void,
): GuidedTourController {
  const [index, setIndex] = useState(0);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i >= total - 1) {
        onFinish();
        return i;
      }
      return i + 1;
    });
  }, [total, onFinish]);

  const prev = useCallback(() => {
    setIndex((i) => (i <= 0 ? 0 : i - 1));
  }, []);

  const reset = useCallback(() => setIndex(0), []);

  return {
    index,
    total,
    isFirst: index === 0,
    isLast: index === total - 1,
    next,
    prev,
    reset,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/hooks/useGuidedTour.test.ts`
Expected: PASS (5 passing).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGuidedTour.ts src/hooks/useGuidedTour.test.ts
git commit -m "feat: add useGuidedTour sequencing hook"
```

---

## Task 4: Tour steps + trigger helper + i18n keys

**Files:**
- Create: `src/components/onboarding/tour/tourSteps.ts`
- Create: `src/components/onboarding/tour/tourSteps.test.ts`
- Modify: `src/locales/fr.json`, `src/locales/en.json`

**Interfaces:**
- Produces:
  ```ts
  interface TourStep { anchor: string | null; titleKey: string; bodyKey: string; placement: "center" | "right" | "bottom" | "top"; }
  const TOUR_STEPS: TourStep[]   // 6 entries
  function shouldShowGuidedTour(settingsLoaded: boolean, tourPending: boolean, activeTab: string): boolean
  ```

- [ ] **Step 1: Write the failing test**

Create `src/components/onboarding/tour/tourSteps.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TOUR_STEPS, shouldShowGuidedTour } from "./tourSteps";

describe("TOUR_STEPS", () => {
  it("starts with a centered, anchorless welcome step", () => {
    expect(TOUR_STEPS[0].anchor).toBeNull();
    expect(TOUR_STEPS[0].placement).toBe("center");
  });

  it("every step has title and body keys", () => {
    for (const s of TOUR_STEPS) {
      expect(s.titleKey).toMatch(/^tour\./);
      expect(s.bodyKey).toMatch(/^tour\./);
    }
  });

  it("includes the four sidebar/hero anchors", () => {
    const anchors = TOUR_STEPS.map((s) => s.anchor);
    expect(anchors).toContain("hero-dictation");
    expect(anchors).toContain("nav-historique");
    expect(anchors).toContain("nav-notes");
    expect(anchors).toContain("nav-parametres");
    expect(anchors).toContain("profile-switcher");
  });
});

describe("shouldShowGuidedTour", () => {
  it("is true only when loaded, pending, and on the accueil tab", () => {
    expect(shouldShowGuidedTour(true, true, "accueil")).toBe(true);
  });
  it("is false when settings not loaded", () => {
    expect(shouldShowGuidedTour(false, true, "accueil")).toBe(false);
  });
  it("is false when not pending", () => {
    expect(shouldShowGuidedTour(true, false, "accueil")).toBe(false);
  });
  it("is false on any other tab", () => {
    expect(shouldShowGuidedTour(true, true, "parametres")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/components/onboarding/tour/tourSteps.test.ts`
Expected: FAIL — module `./tourSteps` not found.

- [ ] **Step 3: Implement the steps + helper**

Create `src/components/onboarding/tour/tourSteps.ts`:

```ts
export interface TourStep {
  /** `data-tour` anchor id, or null for a centered anchorless step. */
  anchor: string | null;
  titleKey: string;
  bodyKey: string;
  /** Preferred bubble placement relative to the spotlight. */
  placement: "center" | "right" | "bottom" | "top";
}

export const TOUR_STEPS: TourStep[] = [
  { anchor: null, titleKey: "tour.welcome.title", bodyKey: "tour.welcome.body", placement: "center" },
  { anchor: "hero-dictation", titleKey: "tour.dictate.title", bodyKey: "tour.dictate.body", placement: "bottom" },
  { anchor: "nav-historique", titleKey: "tour.history.title", bodyKey: "tour.history.body", placement: "right" },
  { anchor: "nav-notes", titleKey: "tour.notes.title", bodyKey: "tour.notes.body", placement: "right" },
  { anchor: "nav-parametres", titleKey: "tour.settings.title", bodyKey: "tour.settings.body", placement: "right" },
  { anchor: "profile-switcher", titleKey: "tour.account.title", bodyKey: "tour.account.body", placement: "right" },
];

/**
 * The tour shows once, on the Accueil tab, after a fresh wizard completion flips
 * `tour_pending`. Gating on `settingsLoaded` avoids a flash before state is known.
 */
export function shouldShowGuidedTour(
  settingsLoaded: boolean,
  tourPending: boolean,
  activeTab: string,
): boolean {
  return settingsLoaded && tourPending && activeTab === "accueil";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/components/onboarding/tour/tourSteps.test.ts`
Expected: PASS (7 passing).

- [ ] **Step 5: Add the `tour.*` i18n keys (French)**

In `src/locales/fr.json`, add a new top-level `"tour"` key:

```json
"tour": {
  "next": "Suivant",
  "prev": "Précédent",
  "finish": "Terminer",
  "skip": "Passer le tour",
  "welcome": {
    "title": "Bienvenue dans Lexena",
    "body": "30 secondes pour découvrir l'essentiel. Tu peux passer à tout moment."
  },
  "dictate": {
    "title": "Dicte d'un clic",
    "body": "Lance l'enregistrement ici — ou depuis n'importe quelle application avec ton raccourci global. Le texte s'insère dans la fenêtre active et une mini-fenêtre flotte pendant la dictée."
  },
  "history": {
    "title": "Ton historique",
    "body": "Toutes tes transcriptions sont conservées ici, prêtes à être copiées ou transformées en notes."
  },
  "notes": {
    "title": "Tes notes",
    "body": "Écris, organise en dossiers et relie tes notes entre elles."
  },
  "settings": {
    "title": "Réglages",
    "body": "Choisis ton micro, ton modèle de transcription et personnalise tes raccourcis ici."
  },
  "account": {
    "title": "Compte & synchro",
    "body": "Connecte-toi pour synchroniser tes réglages et tes notes dans le cloud, sur tous tes appareils."
  }
}
```

- [ ] **Step 6: Add the `tour.*` i18n keys (English)**

In `src/locales/en.json`, add the matching top-level `"tour"` key:

```json
"tour": {
  "next": "Next",
  "prev": "Back",
  "finish": "Done",
  "skip": "Skip tour",
  "welcome": {
    "title": "Welcome to Lexena",
    "body": "30 seconds to learn the essentials. You can skip anytime."
  },
  "dictate": {
    "title": "Dictate in one click",
    "body": "Start recording here — or from any app with your global shortcut. The text is inserted into the active window and a mini window floats while you dictate."
  },
  "history": {
    "title": "Your history",
    "body": "Every transcription is kept here, ready to copy or turn into a note."
  },
  "notes": {
    "title": "Your notes",
    "body": "Write, organize into folders and link your notes together."
  },
  "settings": {
    "title": "Settings",
    "body": "Choose your microphone, transcription model and customize your shortcuts here."
  },
  "account": {
    "title": "Account & sync",
    "body": "Sign in to sync your settings and notes to the cloud across all your devices."
  }
}
```

- [ ] **Step 7: Verify JSON parses + tests still pass**

Run: `pnpm exec tsc --noEmit && pnpm test src/components/onboarding/tour/tourSteps.test.ts`
Expected: PASS. (If `tsc` complains the JSON is malformed, fix the trailing-comma placement where you inserted the `tour` key.)

- [ ] **Step 8: Commit**

```bash
git add src/components/onboarding/tour/tourSteps.ts src/components/onboarding/tour/tourSteps.test.ts src/locales/fr.json src/locales/en.json
git commit -m "feat: add guided tour steps, trigger helper and i18n keys"
```

---

## Task 5: `GuidedTour` presentation component

**Files:**
- Create: `src/components/onboarding/tour/GuidedTour.tsx`
- Create: `src/components/onboarding/tour/GuidedTour.test.tsx`

**Interfaces:**
- Consumes: `useGuidedTour` (Task 3), `TOUR_STEPS` / `TourStep` (Task 4), `Button` from `@/components/ui/button`.
- Produces: `function GuidedTour({ onFinish }: { onFinish: () => void }): JSX.Element` — a portal overlay. When a step's anchor element is missing it auto-advances via `next()`. Mount it only behind the `shouldShowGuidedTour` gate (Task 6).

- [ ] **Step 1: Write the failing test**

Create `src/components/onboarding/tour/GuidedTour.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GuidedTour } from "./GuidedTour";

// i18n returns the key verbatim so we can assert on keys, not copy.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe("GuidedTour", () => {
  it("renders the centered welcome step first", () => {
    render(<GuidedTour onFinish={vi.fn()} />);
    expect(screen.getByText("tour.welcome.title")).toBeTruthy();
    expect(screen.getByText("1 / 6")).toBeTruthy();
  });

  it("calls onFinish when the skip link is clicked", () => {
    const onFinish = vi.fn();
    render(<GuidedTour onFinish={onFinish} />);
    fireEvent.click(screen.getByText("tour.skip"));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/components/onboarding/tour/GuidedTour.test.tsx`
Expected: FAIL — module `./GuidedTour` not found.

- [ ] **Step 3: Implement the component**

Create `src/components/onboarding/tour/GuidedTour.tsx`:

```tsx
import type { CSSProperties } from "react";
import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useGuidedTour } from "@/hooks/useGuidedTour";
import { TOUR_STEPS, type TourStep } from "./tourSteps";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PAD = 8;
const BUBBLE_GAP = 16;

function readRect(anchor: string): Rect | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function bubbleStyle(
  placement: TourStep["placement"],
  spot: Rect | null,
): CSSProperties {
  if (!spot || placement === "center") {
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }
  switch (placement) {
    case "right":
      return { top: spot.top, left: spot.left + spot.width + BUBBLE_GAP };
    case "bottom":
      return { top: spot.top + spot.height + BUBBLE_GAP, left: spot.left };
    case "top":
      return { top: Math.max(8, spot.top - BUBBLE_GAP), left: spot.left };
    default:
      return { top: spot.top, left: spot.left };
  }
}

export function GuidedTour({ onFinish }: { onFinish: () => void }) {
  const { t } = useTranslation();
  const { index, total, isFirst, isLast, next, prev } = useGuidedTour(
    TOUR_STEPS.length,
    onFinish,
  );
  const step = TOUR_STEPS[index];
  const [rect, setRect] = useState<Rect | null>(null);

  // Resolve the anchor rect for the current step. A missing anchor auto-advances
  // rather than rendering an orphan bubble. Recomputes on window resize.
  useLayoutEffect(() => {
    if (step.anchor === null) {
      setRect(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(
      `[data-tour="${step.anchor}"]`,
    );
    if (!el) {
      next();
      return;
    }
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    const update = () => setRect(readRect(step.anchor as string));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [step.anchor, next]);

  const spot: Rect | null = rect
    ? {
        top: rect.top - SPOTLIGHT_PAD,
        left: rect.left - SPOTLIGHT_PAD,
        width: rect.width + SPOTLIGHT_PAD * 2,
        height: rect.height + SPOTLIGHT_PAD * 2,
      }
    : null;

  return createPortal(
    <div
      className="vt-app fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
    >
      {spot ? (
        <div
          className="absolute rounded-xl transition-all duration-200"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
            pointerEvents: "none",
          }}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: "rgba(0,0,0,0.6)" }}
        />
      )}

      <div
        className="absolute w-[320px] max-w-[90vw] rounded-xl border p-4 shadow-2xl"
        style={{
          ...bubbleStyle(step.placement, spot),
          background: "var(--vt-panel)",
          borderColor: "var(--vt-border)",
          color: "var(--vt-fg)",
        }}
      >
        <h3 className="vt-display text-base font-semibold">{t(step.titleKey)}</h3>
        <p className="mt-1.5 text-sm" style={{ color: "var(--vt-fg-2)" }}>
          {t(step.bodyKey)}
        </p>
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onFinish}
            className="text-xs underline-offset-4 hover:underline"
            style={{ color: "var(--vt-fg-3)" }}
          >
            {t("tour.skip")}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: "var(--vt-fg-3)" }}>
              {index + 1} / {total}
            </span>
            {!isFirst && (
              <Button variant="outline" size="sm" onClick={prev}>
                {t("tour.prev")}
              </Button>
            )}
            <Button size="sm" onClick={next}>
              {isLast ? t("tour.finish") : t("tour.next")}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/components/onboarding/tour/GuidedTour.test.tsx`
Expected: PASS (2 passing).

> Note: in jsdom the `data-tour` anchors don't exist, so the welcome step (anchorless) renders correctly; the test never advances past it. The auto-advance-on-missing-anchor path is exercised manually in the app.

- [ ] **Step 5: Commit**

```bash
git add src/components/onboarding/tour/GuidedTour.tsx src/components/onboarding/tour/GuidedTour.test.tsx
git commit -m "feat: add GuidedTour spotlight overlay component"
```

---

## Task 6: Integration — anchors, trigger, replay button

Wires everything together: `data-tour` anchors on real elements, the trigger gate in `Dashboard`, `tour_pending` set on wizard completion, and a "Replay tour" button in Appearance settings. Verification is build + typecheck + the existing unit suite staying green, plus the manual smoke checklist at the end.

**Files:**
- Modify: `src/components/dashboard/home/HeroDictationCard.tsx:42-49` (root `div`)
- Modify: `src/components/dashboard/DashboardSidebar.tsx:193-208` (nav button), `:305` (profile wrapper)
- Modify: `src/components/Dashboard.tsx`
- Modify: `src/components/onboarding/OnboardingFlow.tsx`
- Modify: `src/components/settings/sections/AppearanceSection.tsx`
- Modify: `src/locales/fr.json`, `src/locales/en.json` (replay button keys)

**Interfaces:**
- Consumes: `GuidedTour` (Task 5), `shouldShowGuidedTour` (Task 4), `useAuth().isAuthModalOpen`, `useSettings().updateSetting`, `settings.tour_pending` (Task 2).

- [ ] **Step 1: Add the hero anchor**

In `src/components/dashboard/home/HeroDictationCard.tsx`, add `data-tour="hero-dictation"` to the root `div` (the one with `className="vt-card-elevated relative overflow-hidden p-6 flex flex-col"`):

```tsx
    <div
      data-tour="hero-dictation"
      className="vt-card-elevated relative overflow-hidden p-6 flex flex-col"
      style={{
```

- [ ] **Step 2: Add the sidebar nav anchors**

In `src/components/dashboard/DashboardSidebar.tsx`, on the nav `<button>` inside `visibleNavItems.map(...)`, add the `data-tour` attribute:

```tsx
            <button
              key={id}
              data-tour={`nav-${id}`}
              onClick={() => onTabChange(id)}
```

This yields `nav-accueil`, `nav-historique`, `nav-notes`, `nav-parametres`, etc. The tour references `nav-historique`, `nav-notes`, `nav-parametres`.

- [ ] **Step 3: Add the profile-switcher anchor**

In `src/components/dashboard/DashboardSidebar.tsx`, on the wrapper around `<ProfileSwitcher>` (the `<div className="border-t border-border shrink-0 p-2">` near the bottom):

```tsx
      {/* Profile switcher — always at the very bottom */}
      <div data-tour="profile-switcher" className="border-t border-border shrink-0 p-2">
        <ProfileSwitcher
          collapsed={collapsed}
          onOpenAccountPage={onOpenAccountPage}
        />
      </div>
```

- [ ] **Step 4: Set `tour_pending` on wizard completion**

In `src/components/onboarding/OnboardingFlow.tsx`, update `markComplete`:

```tsx
  const markComplete = () => {
    void updateSetting("onboarding_completed", true);
    void updateSetting("tour_pending", true);
  };
```

- [ ] **Step 5: Mount the tour behind the trigger gate in `Dashboard`**

In `src/components/Dashboard.tsx`:

5a. Add imports:

```tsx
import { GuidedTour } from "./onboarding/tour/GuidedTour";
import { shouldShowGuidedTour } from "./onboarding/tour/tourSteps";
```

5b. Pull `updateSetting` and `isAuthModalOpen`:

```tsx
  const { settings, isLoaded: settingsLoaded, updateSetting } = useSettings();
  const { user, status: authStatus, isAuthModalOpen } = useAuth();
```

5c. Render the tour next to the existing `{showOnboarding && <OnboardingFlow ... />}` line:

```tsx
      {showOnboarding && <OnboardingFlow onComplete={recheckOnboarding} />}

      {!isAuthModalOpen &&
        shouldShowGuidedTour(
          settingsLoaded,
          settings.tour_pending,
          activeTab,
        ) && (
          <GuidedTour
            onFinish={() => void updateSetting("tour_pending", false)}
          />
        )}
```

- [ ] **Step 6: Add the replay button to Appearance settings**

6a. In `src/locales/fr.json`, inside the `"tour"` object you created in Task 4, add two keys:

```json
"replayButton": "Revoir le tour guidé",
"replayHint": "Relance la visite guidée des fonctionnalités principales."
```

In `src/locales/en.json`, inside `"tour"`:

```json
"replayButton": "Replay guided tour",
"replayHint": "Restart the guided tour of the main features."
```

6b. In `src/components/settings/sections/AppearanceSection.tsx`, add a `Row` inside the first `vt-card-sectioned` card (the "Interface" card), right after the theme `Row`'s closing tag and before that card's closing `</div>`. The tour only renders on the Accueil tab, so the button sets `tour_pending` and dispatches a dedicated `lexena:start-tour` event (handled in Step 7) to navigate there:

```tsx
        <Row
          label={t("tour.replayButton")}
          hint={t("tour.replayHint")}
        >
          <button
            type="button"
            className="vt-btn"
            style={{ height: 36 }}
            onClick={async () => {
              await updateSetting("tour_pending", true);
              window.dispatchEvent(new CustomEvent("lexena:start-tour"));
            }}
          >
            {t("tour.replayButton")}
          </button>
        </Row>
```

- [ ] **Step 7: Handle `lexena:start-tour` in `Dashboard` (switch to Accueil)**

In `src/components/Dashboard.tsx`, add an effect (next to the existing `lexena:open-settings` listener effect) that switches to the Accueil tab when the tour is requested:

```tsx
  useEffect(() => {
    const onStartTour = () => setActiveTab("accueil");
    window.addEventListener("lexena:start-tour", onStartTour);
    return () => window.removeEventListener("lexena:start-tour", onStartTour);
  }, []);
```

- [ ] **Step 8: Typecheck, build, and run the full test suite**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: PASS — typecheck clean, all unit tests green (including the new settings/hook/tour tests and the existing `useOnboardingCheck` suite).

- [ ] **Step 9: Manual smoke (ask the user to run `pnpm tauri dev`)**

Verify, in order:
1. Fresh profile (or temporarily set `onboarding_completed=false`, `tour_pending=false`): wizard appears.
2. On the demo step: the **Microphone** dropdown lists devices; changing it persists. The **"Passer cette étape"** link jumps to the cloud-vs-local Choice step.
3. Complete the wizard (cloud or local). On landing on Accueil, the **guided tour** appears starting at the welcome step.
4. Next/Back/step counter work; spotlight lands on hero card → Historique → Notes → Paramètres → profile switcher; **Done**/**Skip tour** closes it and it does **not** reappear on reload.
5. Settings → Appearance → **"Revoir le tour guidé"** returns to Accueil and replays the tour.
6. Cloud path: while the auth modal is open, the tour does **not** overlap it.

- [ ] **Step 10: Commit**

```bash
git add src/components/dashboard/home/HeroDictationCard.tsx src/components/dashboard/DashboardSidebar.tsx src/components/Dashboard.tsx src/components/onboarding/OnboardingFlow.tsx src/components/settings/sections/AppearanceSection.tsx src/locales/fr.json src/locales/en.json
git commit -m "feat: wire guided tour trigger, anchors and replay button"
```

---

## Self-Review

**Spec coverage:**
- A1 mic selector → Task 1 (Steps 2–3). ✓
- A2 skip button → Task 1 (Steps 4–5). ✓
- A3 clarity (label) → Task 1 (Step 3, "Microphone" label). ✓
- B1 `useGuidedTour` → Task 3. ✓
- B2 `GuidedTour` spotlight/bubble → Task 5. ✓
- B3 anchors (hero, nav-*, profile) → Task 6 (Steps 1–3). ✓
- C itinerary (6 steps) → Task 4 `TOUR_STEPS` + i18n. ✓
- D trigger + `tour_pending` default false + migration safety → Task 2 + Task 6 (Steps 4–5). ✓
- E replay button in Appearance → Task 6 (Steps 6–7). ✓
- F i18n (fr+en, both namespaces) + tests → Tasks 1, 3, 4, 5. ✓
- Edge: missing anchor → auto-advance (Task 5, `useLayoutEffect`). Auth-modal overlap → gated in Task 6 Step 5c. Settings-loading flash → `shouldShowGuidedTour` requires `settingsLoaded`. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `useGuidedTour(total, onFinish)` signature identical across Tasks 3 and 5. `TourStep` fields (`anchor`/`titleKey`/`bodyKey`/`placement`) identical across Tasks 4 and 5. `shouldShowGuidedTour(settingsLoaded, tourPending, activeTab)` identical across Tasks 4 and 6. `tour_pending` key identical across Tasks 2, 6. The replay button and its `Dashboard` listener both use the `lexena:start-tour` event. ✓
