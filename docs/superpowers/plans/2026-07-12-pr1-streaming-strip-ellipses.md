# PR 1 — Streaming Ellipsis Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supprimer les points de suspension parasites (`...`, `…`) que Whisper produit sur les hésitations en mode streaming, du live HUD comme du texte final.

**Architecture:** Une fonction pure `stripEllipses` exportée depuis `src/lib/streaming/assembler.ts`, appliquée dans `TranscriptAssembler.upsert()` — point de passage unique du live et du final. Une garde dans `useStreamingSession` traite une session assemblée vide (que des hésitations) comme une session vide au lieu de la finaliser.

**Tech Stack:** TypeScript, Vitest. Aucun changement Rust, aucune dépendance nouvelle.

**Spec:** `docs/superpowers/specs/2026-07-12-ux-improvements-multi-pr-design.md` (section PR 1)

## Global Constraints

- Branche `main` protégée : jamais de commit direct, la PR part d'une branche dédiée.
- Le mode batch (non-streaming) n'est **pas** modifié.
- On ne répare pas le reste de la ponctuation de Whisper (point orphelin conservé).
- Aucune nouvelle string UI dans cette PR (donc pas d'i18n à toucher).
- CHANGELOG en anglais.
- Suite de tests : `pnpm test` (vitest run) ; ciblé : `pnpm exec vitest run src/lib/streaming/assembler.test.ts`.

## Setup (avant Task 1)

La branche du spec `docs/ux-improvements-spec` contient déjà le design doc (commit `d87e45f`). La PR 1 embarque le spec et ce plan :

```bash
git checkout docs/ux-improvements-spec
git checkout -b feat/streaming-strip-ellipses
git add docs/superpowers/plans/2026-07-12-pr1-streaming-strip-ellipses.md
git commit -m "docs: add PR1 streaming ellipsis cleanup plan"
```

---

### Task 1: Fonction pure `stripEllipses`

**Files:**
- Modify: `src/lib/streaming/assembler.ts` (ajout d'une fonction exportée en tête de fichier)
- Test: `src/lib/streaming/assembler.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `export function stripEllipses(text: string): string` — supprime toute séquence de 3 points ou plus et tout `…` (répété inclus), normalise les espaces, trim. Utilisée par Task 2.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter en fin de `src/lib/streaming/assembler.test.ts` (l'import existant devient `import { TranscriptAssembler, stripEllipses } from "./assembler";`) :

```ts
describe("stripEllipses", () => {
  it("removes a trailing ellipsis glued to a word", () => {
    expect(stripEllipses("ni le feu ni la glace ne serait... atteindre")).toBe(
      "ni le feu ni la glace ne serait atteindre",
    );
  });

  it("removes a free-standing ellipsis between sentences", () => {
    expect(stripEllipses("dans l'illusion. ... de son cœur.")).toBe(
      "dans l'illusion. de son cœur.",
    );
  });

  it("removes unicode ellipses, including repeated ones", () => {
    expect(stripEllipses("Bonjour… monde")).toBe("Bonjour monde");
    expect(stripEllipses("Attends……")).toBe("Attends");
  });

  it("removes runs of more than three dots", () => {
    expect(stripEllipses("euh.... donc")).toBe("euh donc");
  });

  it("returns an empty string for ellipsis-only text", () => {
    expect(stripEllipses("...")).toBe("");
    expect(stripEllipses(" … ")).toBe("");
  });

  it("keeps sentence punctuation preceding an ellipsis", () => {
    expect(stripEllipses("Quoi ?...")).toBe("Quoi ?");
    expect(stripEllipses("Non !...")).toBe("Non !");
  });

  it("keeps two dots (not an ellipsis)", () => {
    expect(stripEllipses("Attends..")).toBe("Attends..");
  });

  it("leaves text without ellipses unchanged", () => {
    expect(stripEllipses("Un, deux, trois.")).toBe("Un, deux, trois.");
  });
});
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `pnpm exec vitest run src/lib/streaming/assembler.test.ts`
Expected: FAIL — `stripEllipses` n'est pas exporté (erreur d'import / `stripEllipses is not a function`).

- [ ] **Step 3: Implémenter `stripEllipses`**

Dans `src/lib/streaming/assembler.ts`, au-dessus de la classe :

```ts
/**
 * Whisper transcribes hesitation pauses as ellipses ("...", "…"), which
 * pollute streamed dictation with stray dots the user then has to edit out.
 * Dictating a literal ellipsis is rare enough that we strip them all
 * (spec 2026-07-12, PR 1).
 */
export function stripEllipses(text: string): string {
  return text
    .replace(/(?:\.{3,}|…+)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `pnpm exec vitest run src/lib/streaming/assembler.test.ts`
Expected: PASS (8 nouveaux tests + 7 existants).

- [ ] **Step 5: Commit**

```bash
git add src/lib/streaming/assembler.ts src/lib/streaming/assembler.test.ts
git commit -m "feat: add stripEllipses helper for streaming transcripts"
```

---

### Task 2: Application dans `TranscriptAssembler.upsert`

**Files:**
- Modify: `src/lib/streaming/assembler.ts:13-16` (méthode `upsert`)
- Test: `src/lib/streaming/assembler.test.ts`

**Interfaces:**
- Consumes: `stripEllipses(text: string): string` (Task 1).
- Produces: `TranscriptAssembler.upsert(index: number, text: string): void` stocke désormais le texte nettoyé — signature inchangée, aucun appelant à modifier (`session.ts` appelle déjà `upsert`).

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter dans le `describe("TranscriptAssembler", ...)` existant :

```ts
  it("strips ellipses from chunk texts before assembly", () => {
    const a = new TranscriptAssembler();
    a.upsert(0, "ni le feu ni la glace ne serait...");
    a.upsert(1, "atteindre en intensité, ce qu'enferme un homme dans l'illusion.");
    a.upsert(2, "... de son cœur.");
    expect(a.assembled()).toBe(
      "ni le feu ni la glace ne serait atteindre en intensité, ce qu'enferme un homme dans l'illusion. de son cœur.",
    );
  });

  it("excludes chunks that were only ellipses from the join", () => {
    const a = new TranscriptAssembler();
    a.upsert(0, "Début");
    a.upsert(1, "...");
    a.upsert(2, "fin.");
    expect(a.assembled()).toBe("Début fin.");
  });
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `pnpm exec vitest run src/lib/streaming/assembler.test.ts`
Expected: FAIL — les `...` apparaissent encore dans `assembled()`.

- [ ] **Step 3: Nettoyer dans `upsert`**

Dans `src/lib/streaming/assembler.ts`, remplacer :

```ts
  upsert(index: number, text: string): void {
    this.failed.delete(index);
    this.texts.set(index, text);
  }
```

par :

```ts
  upsert(index: number, text: string): void {
    this.failed.delete(index);
    this.texts.set(index, stripEllipses(text));
  }
```

Note : un chunk réduit à `""` reste compté dans `okCount` (sémantique inchangée — `okCount` compte les uploads réussis) mais est déjà exclu du join par `assembled()`.

- [ ] **Step 4: Vérifier que tout passe**

Run: `pnpm exec vitest run src/lib/streaming/assembler.test.ts`
Expected: PASS (17 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/streaming/assembler.ts src/lib/streaming/assembler.test.ts
git commit -m "feat: strip Whisper hesitation ellipses from streaming chunks"
```

---

### Task 3: Garde session vide + CHANGELOG

**Files:**
- Modify: `src/hooks/useStreamingSession.ts:184-199` (handler `streaming-session-end`)
- Modify: `CHANGELOG.md` (section `[Unreleased]`)

**Interfaces:**
- Consumes: `outcome.text` (résultat de `StreamingUploadSession.finish()`, déjà nettoyé par Tasks 1-2) ; `onEmptyRef` (existant dans le hook).
- Produces: rien de nouveau — comportement : une session dont le texte assemblé est vide déclenche `onEmpty()` (toast « aucun son ») au lieu de `onFinalize("")`.

**Pourquoi :** avant cette PR, une session avec des chunks réussis produisait toujours du texte. Après nettoyage, une session faite uniquement d'hésitations (`...`) s'assemble en `""` — la finaliser créerait une entrée d'historique vide et un collage vide. Pas de test unitaire dédié : le hook n'a pas de harnais (mocks Tauri lourds) et la garde est un `if` de 3 lignes — vérification au smoke test manuel.

- [ ] **Step 1: Ajouter la garde**

Dans `src/hooks/useStreamingSession.ts`, dans le listener `streaming-session-end`, après le bloc `if (outcome.chunksOk === 0) { ... }` et avant `await onFinalizeRef.current(...)`, insérer :

```ts
            // A session made only of hesitations assembles to "" after
            // ellipsis stripping — treat it as empty instead of finalizing
            // (an empty history entry + empty paste would be useless).
            if (outcome.text.length === 0) {
              onEmptyRef.current();
              return;
            }
```

- [ ] **Step 2: Vérifier la compilation et la suite complète**

Run: `pnpm build` puis `pnpm test`
Expected: build OK, tous les tests passent (aucune régression — 266+ tests Vitest).

- [ ] **Step 3: Entrée CHANGELOG**

Dans `CHANGELOG.md`, sous `## [Unreleased]`, ajouter après la section `### Added` :

```markdown
### Fixed
- **Streaming mode** — hesitation pauses no longer leave stray ellipses ("...") in the live transcript and the final text; Whisper's hesitation artifacts are stripped from each segment. A session made only of hesitations is now treated as an empty recording instead of producing an empty history entry.
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useStreamingSession.ts CHANGELOG.md
git commit -m "fix: treat all-hesitation streaming session as empty"
```

---

### Vérification finale (avant PR)

- [ ] `pnpm test` — suite complète verte.
- [ ] `pnpm build` — compilation TypeScript + Vite OK.
- [ ] Smoke test manuel (nécessite `pnpm tauri dev` lancé par l'utilisateur — ne pas le lancer soi-même) : dicter en streaming avec des hésitations volontaires → plus aucun `...` dans le HUD ni dans le texte collé ; session faite uniquement d'hésitations → toast « aucun son », pas d'entrée d'historique.
- [ ] Ouvrir la PR vers `main` : `feat/streaming-strip-ellipses` (contient aussi le spec + ce plan).
