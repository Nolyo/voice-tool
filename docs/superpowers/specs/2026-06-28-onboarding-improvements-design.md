# Onboarding improvements — design

Date: 2026-06-28
Status: Draft (pending user review)
Branch: `feat/onboarding-improvements`

## Problem

The first-run experience has three concrete friction points raised by the product owner:

1. **No microphone choice during the "test mic" step.** The `TryItStep` (the demo
   recording in the first-run wizard) silently uses the default input device
   (`settings.input_device_index ?? null`). If the default device is wrong, the
   user is stuck — there is no picker.
2. **No way to skip the demo.** In the `idle` state, `TryItStep` only renders a
   *Back* button. The only path forward without a successful recording is clicking
   the progress dots to jump to step 4, which is not discoverable. The user
   perceives this as "I can't pass."
3. **The app is not self-explanatory after onboarding.** Modern apps surface small
   contextual pop-ups (coach marks) that point at UI elements and explain what does
   what. Lexena has none.

## Goals

- Let the user pick their microphone inside the wizard's demo step.
- Let the user skip the demo (but not escape the wizard's cloud-vs-local choice).
- Add a guided sequential tour (coach marks) that runs once after onboarding and
  explains the main UI elements.

## Non-goals

- No redesign of the wizard's overall 4-step structure (hero → capabilities →
  try-it → choice).
- No ambient/always-on help icons. The chosen experience is a one-pass guided tour
  (replayable on demand), not persistent hint badges.
- No live pre-record level meter in the demo. The existing during-recording bars
  remain the "is my mic working" feedback; scope stays minimal.
- The tour does not drive tab navigation. It points only at elements that are
  always visible on the Accueil tab (hero card + sidebar + profile switcher).

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Scope | Both: fix wizard frictions **and** add the guided tour. |
| Mic-test step role | Keep the cloud demo; add a visible mic selector + a Skip button. |
| Coach-mark style | Guided **sequential** tour (not ambient hints). |
| Tour engine | **Custom lightweight** (~150–200 lines), built on Radix + `.vt-app` OKLCH tokens. No new dependency. |

## Architecture

Two workstreams, designed together, shippable independently.

### A. Wizard friction fixes (`TryItStep`)

**A1 — Microphone selector.**
A compact `Select` at the top of the demo card (visible in `idle` and `recording`
states), populated by the existing `useAudioDevices()` hook (Rust command
`get_audio_devices`, returns `{ name, index, is_default }[]`). Initial value =
`settings.input_device_index` (falls back to the default device). On change, persist
to `settings.input_device_index`, so the choice applies app-wide, not just the demo.
The existing `handleStart` already reads `settings.input_device_index` — no Rust
change required.

**A2 — Skip button.**
A discreet "Passer cette étape" link in the `idle`-state footer that jumps to the
**Choice** step (step 4) via a new `onSkip` prop wired in `OnboardingFlow`
(`() => setStep(4)`). This does **not** exit the wizard: the comment in
`OnboardingFlow` documents that a "hard dismiss" would leave a brand-new user with
no local model and no account → unusable. Skipping only bypasses the demo; the
cloud-vs-local choice remains mandatory.

**A3 — Clarity.**
A small "Micro" label above the selector. No further copy rework.

**Files:** `src/components/onboarding/steps/TryItStep.tsx`,
`src/components/onboarding/OnboardingFlow.tsx`.

### B. Guided tour engine (custom)

**B1 — `useGuidedTour` hook (all testable logic).**
Holds the current step index and exposes `next()` / `prev()` / `skip()` /
`finish()`, with clamping at the bounds and the visible/hidden state. No DOM
dependency → fully unit-testable.

**B2 — `GuidedTour` component (presentation, via portal).**
- **Spotlight overlay:** compute `getBoundingClientRect()` of the target element
  (located by a `data-tour="<id>"` attribute) and cut a "hole" around it using a
  large `box-shadow` on a positioned div (simple; no SVG mask). Dimmed backdrop
  elsewhere.
- **Bubble:** positioned near the target — title, body, step counter ("2 / 6"),
  *Précédent / Suivant / Terminer* buttons, and a *Passer le tour* link.
- Recompute the rect on `resize`; `scrollIntoView` the target when needed.
- Styled entirely with `.vt-app` tokens for visual consistency.

**B3 — Anchors.**
`data-tour` attributes added to always-visible elements on the Accueil tab:
`HeroDictationCard`, the sidebar nav buttons (Historique, Notes, Paramètres), and
`ProfileSwitcher`. The tour stays on the Accueil tab and points at the sidebar — no
cross-tab orchestration needed, which keeps the engine simple.

**Files:** new `src/components/onboarding/tour/GuidedTour.tsx`,
`src/hooks/useGuidedTour.ts`, `src/components/onboarding/tour/tourSteps.ts`;
`data-tour` added to `HeroDictationCard.tsx`, `DashboardSidebar.tsx`,
`ProfileSwitcher.tsx`; mount in `Dashboard.tsx`.

### C. Tour itinerary (6 steps, Accueil tab)

| # | Anchor (`data-tour`) | Message (summary) |
|---|---|---|
| 1 | *(centered, no anchor)* | "Bienvenue dans Lexena — 30 s pour l'essentiel." |
| 2 | `HeroDictationCard` | "Dicte d'un clic. Le texte s'insère dans l'app active. Lance depuis n'importe où avec ton raccourci global → une mini-fenêtre flotte pendant l'enregistrement." |
| 3 | sidebar `Historique` | "Toutes tes transcriptions sont conservées ici." |
| 4 | sidebar `Notes` | "Écris, organise et relie tes notes." |
| 5 | sidebar `Paramètres` | "Micro, modèle de transcription, raccourcis : tout se règle ici." |
| 6 | `ProfileSwitcher` | "Ton compte et la synchro cloud de tes réglages/notes." → *Terminer* |

Step 2 absorbs the global hotkey + mini-window explanation in text (no dedicated
anchor — the mini window is a separate OS window). 6 steps = "standard" depth;
can be trimmed to 4 if preferred.

### D. Trigger & persistence

- New flag `tour_pending: boolean` in `src/lib/settings.ts` (default **`false`**).
- `OnboardingFlow.markComplete()` sets `tour_pending = true` alongside
  `onboarding_completed = true`.
- The tour renders when `settingsLoaded && tour_pending && activeTab === "accueil"`.
  On *Terminer* / *Passer le tour* → `tour_pending = false`.
- **Migration safety:** default `false` means existing beta users (who already have
  `onboarding_completed = true`) never get `tour_pending = true`, so no surprise
  tour on update. Only a fresh wizard completion activates it.

### E. Replay

A "Revoir le tour guidé" button in Settings → Appearance/General that sets
`tour_pending = true` and switches to the Accueil tab. Near-zero cost; also useful
for manual testing.

**Files:** `src/lib/settings.ts` (flag + default), `Dashboard.tsx` (trigger),
a Settings section (replay button), translation files.

### F. i18n & testing

- **i18n:** new FR + EN keys for tour steps, the "Micro" label, "Passer cette
  étape", and the replay button. No hardcoded UI strings (project rule).
- **Tests:** unit tests for `useGuidedTour` (next/prev/skip/finish, clamping) and
  the trigger condition. Positioning/layout lives in the presentation layer and is
  not covered under jsdom.

## Error handling & edge cases

- **Device list fails to load** (A1): the selector falls back to showing only the
  default; the demo still works with the system default.
- **Device unplugged mid-wizard:** `start_recording` already surfaces an error →
  existing `error` phase handles it.
- **Target element missing when a tour step renders** (B2): if `data-tour` anchor is
  not found, skip to the next step rather than rendering an orphan bubble.
- **Window resized / sidebar collapsed during the tour:** recompute rect on resize;
  if the sidebar is collapsed, the nav buttons are still present (icon-only) and
  remain valid anchors.
- **Settings still loading:** the tour gate requires `settingsLoaded`, so it never
  flashes before state is known.

## Rollout

- Ship A (wizard fixes) and B (tour) as separate commits/PRs on
  `feat/onboarding-improvements`; A is low-risk and can merge first.
- No DB / Supabase change. Purely local settings + frontend.
- No new runtime dependency.
