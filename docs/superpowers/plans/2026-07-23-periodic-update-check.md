# Periodic Update Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Détecter une mise à jour disponible au plus tard ~1 h après sa publication même quand l'app tourne depuis des jours, via un polling horaire côté frontend.

**Architecture:** Une fonction pure `shouldCheckNow` (module `src/lib/updater/periodic-check.ts`, testée en Vitest) décide si un check est dû ; `UpdaterContext` la branche sur un `setInterval` de 60 s qui compare des timestamps — robuste à la veille PC et au throttling WebView2. Aucun changement Rust.

**Tech Stack:** React 19 + TypeScript, Vitest 4. Spec validée : `docs/superpowers/specs/2026-07-23-periodic-update-check-design.md`.

## Global Constraints

- Intervalle de check : **1 h codé en dur** (`3_600_000` ms) ; tick du timer : **60 s**. Pas de nouveau setting — comportement contrôlé par `settings.auto_check_updates` existant.
- Aucun changement Rust, aucune nouvelle string i18n, aucune modal spontanée (notification = `updateAvailable = true`, UI existante).
- Échec de check silencieux : `console.error` uniquement, prochain essai à l'heure suivante (le timestamp est mis à jour même en cas d'échec).
- Commits conventionnels en anglais. Branche de travail : `feat/periodic-update-check` (déjà créée, main protégée).
- Tests : `pnpm test` (Vitest, `vitest run`). Typecheck via `pnpm build`.

---

### Task 1: Module pur `periodic-check` (décision "faut-il checker maintenant ?")

**Files:**
- Create: `src/lib/updater/periodic-check.ts`
- Test: `src/lib/updater/periodic-check.test.ts`

**Interfaces:**
- Consumes: rien (module feuille, zéro dépendance).
- Produces (utilisé par Task 2) :
  - `PERIODIC_CHECK_INTERVAL_MS: number` (= 3_600_000)
  - `PERIODIC_TICK_MS: number` (= 60_000)
  - `interface PeriodicCheckState { lastCheckTime: number | null; updateAvailable: boolean; isChecking: boolean; isDownloading: boolean }`
  - `shouldCheckNow(state: PeriodicCheckState, now: number): boolean`

- [ ] **Step 1: Write the failing test**

Créer `src/lib/updater/periodic-check.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import {
  PERIODIC_CHECK_INTERVAL_MS,
  shouldCheckNow,
  type PeriodicCheckState,
} from "./periodic-check";

const NOW = 1_800_000_000_000;

function state(overrides: Partial<PeriodicCheckState> = {}): PeriodicCheckState {
  return {
    lastCheckTime: null,
    updateAvailable: false,
    isChecking: false,
    isDownloading: false,
    ...overrides,
  };
}

describe("shouldCheckNow", () => {
  it("returns true when no check has ever completed", () => {
    expect(shouldCheckNow(state(), NOW)).toBe(true);
  });

  it("returns false when less than one hour has elapsed", () => {
    const s = state({ lastCheckTime: NOW - PERIODIC_CHECK_INTERVAL_MS + 1 });
    expect(shouldCheckNow(s, NOW)).toBe(false);
  });

  it("returns true at exactly one hour elapsed", () => {
    const s = state({ lastCheckTime: NOW - PERIODIC_CHECK_INTERVAL_MS });
    expect(shouldCheckNow(s, NOW)).toBe(true);
  });

  it("returns true well past one hour (wake from sleep)", () => {
    const s = state({ lastCheckTime: NOW - 8 * PERIODIC_CHECK_INTERVAL_MS });
    expect(shouldCheckNow(s, NOW)).toBe(true);
  });

  it("returns false when an update is already detected", () => {
    const s = state({
      lastCheckTime: NOW - 2 * PERIODIC_CHECK_INTERVAL_MS,
      updateAvailable: true,
    });
    expect(shouldCheckNow(s, NOW)).toBe(false);
  });

  it("returns false while a check is in flight", () => {
    const s = state({
      lastCheckTime: NOW - 2 * PERIODIC_CHECK_INTERVAL_MS,
      isChecking: true,
    });
    expect(shouldCheckNow(s, NOW)).toBe(false);
  });

  it("returns false while a download is in progress", () => {
    const s = state({
      lastCheckTime: NOW - 2 * PERIODIC_CHECK_INTERVAL_MS,
      isDownloading: true,
    });
    expect(shouldCheckNow(s, NOW)).toBe(false);
  });

  it("returns false when an update is detected even if no check ever completed", () => {
    const s = state({ updateAvailable: true });
    expect(shouldCheckNow(s, NOW)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/updater/periodic-check.test.ts`
Expected: FAIL — `Cannot find module './periodic-check'` (ou équivalent "Failed to resolve import").

- [ ] **Step 3: Write minimal implementation**

Créer `src/lib/updater/periodic-check.ts` :

```ts
// Decides whether the hourly background update check is due. Kept as a pure
// module so the timestamp/guard logic is unit-testable outside React.

export const PERIODIC_CHECK_INTERVAL_MS = 3_600_000; // 1 hour
export const PERIODIC_TICK_MS = 60_000; // 1 minute

export interface PeriodicCheckState {
  /** Epoch ms of the last check started (startup, manual or periodic), or null. */
  lastCheckTime: number | null;
  updateAvailable: boolean;
  isChecking: boolean;
  isDownloading: boolean;
}

export function shouldCheckNow(state: PeriodicCheckState, now: number): boolean {
  if (state.updateAvailable || state.isChecking || state.isDownloading) {
    return false;
  }
  if (state.lastCheckTime === null) {
    return true;
  }
  return now - state.lastCheckTime >= PERIODIC_CHECK_INTERVAL_MS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/updater/periodic-check.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/updater/periodic-check.ts src/lib/updater/periodic-check.test.ts
git commit -m "feat: add pure decision module for periodic update check"
```

---

### Task 2: Branchement du polling horaire dans `UpdaterContext`

**Files:**
- Modify: `src/contexts/UpdaterContext.tsx`

**Interfaces:**
- Consumes (Task 1) : `shouldCheckNow(state, now)`, `PERIODIC_TICK_MS` depuis `@/lib/updater/periodic-check`.
- Produces : rien de nouveau — le contrat `UpdaterContextType` est inchangé.

Pas de harnais de test React dans le projet (Vitest couvre `src/lib/` uniquement) : la logique décisionnelle est déjà testée en Task 1 ; cette task est du câblage vérifié par typecheck + suite complète + validation manuelle décrite dans la spec.

- [ ] **Step 1: Enregistrer le timestamp des checks existants**

Dans `src/contexts/UpdaterContext.tsx` :

a) Ajouter le ref après `const updaterRef = useRef(updater);` (ligne ~53) :

```tsx
  const lastCheckTimeRef = useRef<number | null>(null);
```

b) Dans l'effet startup, stamper avant l'appel — remplacer :

```tsx
    const timer = setTimeout(async () => {
      console.log("UpdaterContext: Checking for updates on startup...");
      try {
```

par :

```tsx
    const timer = setTimeout(async () => {
      console.log("UpdaterContext: Checking for updates on startup...");
      lastCheckTimeRef.current = Date.now();
      try {
```

c) Dans le callback manuel, stamper aussi — remplacer :

```tsx
  const checkForUpdates = useCallback(async () => {
    const info = await updater.checkForUpdates();
    setUpdateAvailable(info?.available ?? false);
    return info;
  }, [updater]);
```

par :

```tsx
  const checkForUpdates = useCallback(async () => {
    lastCheckTimeRef.current = Date.now();
    const info = await updater.checkForUpdates();
    setUpdateAvailable(info?.available ?? false);
    return info;
  }, [updater]);
```

Le stamp se fait au **démarrage** du check (succès ou échec confondus) : c'est ce qui garantit "pas de retry rapproché après un échec" (spec) et évite tout double-check concurrent.

- [ ] **Step 2: Ajouter l'effet de polling périodique**

a) Ajouter l'import en tête de fichier, après l'import `useSettings` :

```tsx
import {
  PERIODIC_TICK_MS,
  shouldCheckNow,
} from "@/lib/updater/periodic-check";
```

b) Insérer ce nouvel effet juste après l'effet startup (après son `}, [isLoaded, settings.auto_check_updates]);`, ligne ~102) :

```tsx
  // Periodic re-check: the app can stay open for days (PC sleep, tray), so a
  // startup-only check misses releases. A short tick comparing timestamps is
  // robust to sleep/wake — a 1h setInterval would drift after suspend.
  useEffect(() => {
    if (!isLoaded || !settings.auto_check_updates) {
      return;
    }

    const interval = setInterval(async () => {
      const updaterNow = updaterRef.current;
      const due = shouldCheckNow(
        {
          lastCheckTime: lastCheckTimeRef.current,
          updateAvailable,
          isChecking: updaterNow.isChecking,
          isDownloading: updaterNow.isDownloading,
        },
        Date.now(),
      );
      if (!due) {
        return;
      }

      console.log("UpdaterContext: Running periodic update check...");
      lastCheckTimeRef.current = Date.now();
      try {
        const info = await updaterNow.checkForUpdates();
        if (info?.available) {
          console.log(
            "UpdaterContext: Periodic check found update:",
            info.version,
          );
          setUpdateAvailable(true);
        }
      } catch (error) {
        console.error("UpdaterContext: Periodic update check failed:", error);
      }
    }, PERIODIC_TICK_MS);

    return () => clearInterval(interval);
  }, [isLoaded, settings.auto_check_updates, updateAvailable]);
```

Notes de câblage :
- `updateAvailable` est dans les deps : quand il passe à `true`, l'interval est recréé avec une closure fraîche (le flip est rare, le coût est nul) — sans ça, la garde de `shouldCheckNow` lirait une valeur figée.
- `isChecking`/`isDownloading` sont lus via `updaterRef.current` (déjà tenu à jour par l'effet existant), donc toujours frais sans élargir les deps.
- Pas de check immédiat au montage de l'effet : le check startup existant (timer 10 s) couvre le démarrage ; le premier tick périodique arrive 60 s plus tard et `shouldCheckNow` le refusera (< 1 h).

- [ ] **Step 3: Typecheck + suite complète**

Run: `pnpm build && pnpm test`
Expected: build TypeScript OK, tous les tests Vitest passent (dont les 8 de `periodic-check.test.ts`).

- [ ] **Step 4: Commit**

```bash
git add src/contexts/UpdaterContext.tsx
git commit -m "feat: re-check for updates hourly while app is running"
```

---

### Validation manuelle (post-implémentation, hors CI)

Décrite dans la spec : réduire temporairement `PERIODIC_CHECK_INTERVAL_MS` (et éventuellement `PERIODIC_TICK_MS`) dans `periodic-check.ts`, lancer l'app en dev (demander à l'utilisateur de lancer `pnpm tauri dev`), et vérifier dans la console webview que `Running periodic update check...` apparaît au tick attendu puis que la bannière sidebar s'affiche si une update (ou le mock `VITE_MOCK_UPDATE_AVAILABLE` — attention : le mock force l'UI sans passer par le polling, préférer une vraie release ou observer les logs). Remettre les constantes avant commit final.
