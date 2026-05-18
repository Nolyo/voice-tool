# Plan d'implémentation — Onboarding cloud-first

**Date** : 2026-05-18
**Spec source** : [`docs/superpowers/specs/2026-05-18-onboarding-cloud-first-design.md`](../specs/2026-05-18-onboarding-cloud-first-design.md)
**Branche** : `feat/onboarding-cloud-first`

## Préambule

Ce plan est exécuté de façon autonome par Claude. L'utilisateur testera le résultat sur la branche après son CDI.

Toutes les modifications respectent les feedbacks mémoire :
- i18n obligatoire pour tout texte UI
- Pas de cassure de deps existantes
- Pas de bidouillage : composants propres, testés
- PowerShell pour les commandes shell
- Pas de framing « pour les utilisateurs » (parc = 0 jusqu'à v3.2)
- Branche + PR (pas de commit direct sur main)

## Étapes

### Étape 1 — Branche dédiée

- Créer une branche `feat/onboarding-cloud-first` depuis `main`.
- Pas de worktree : on travaille en place pour simplifier les commandes Windows.

### Étape 2 — Settings & migration

**Fichiers** : `src/lib/settings.ts`

- Ajouter `onboarding_completed: boolean` à `AppSettings.settings`, défaut `false`.

**Pas de migration côté Rust** — Tauri Store gère automatiquement les clés absentes (defaults appliqués côté front au load).

### Étape 3 — Hook useOnboardingCheck remanié

**Fichiers** : `src/hooks/useOnboardingCheck.ts` + nouveau test `src/hooks/useOnboardingCheck.test.ts`

- Remplacer la logique actuelle (« provider Local + aucun modèle ») par :
  - `showOnboarding = !settings.onboarding_completed`
- Ajouter migration silencieuse au mount : si `!onboarding_completed` ET (any_local_model_exists OU `user` non-null OU `provider !== "Local"`), alors `updateSetting("onboarding_completed", true)`.
- Le hook accepte désormais `user: User | null` en paramètre supplémentaire pour la heuristique.
- Test : monter le hook avec `any_local_model_exists=true` → vérifie qu'`onboarding_completed` est mis à `true`.

### Étape 4 — Composants illustration

**Nouveau dossier** : `src/components/onboarding/illustrations/`

- `HotkeyToTextDemo.tsx` : SVG animé via keyframes CSS. Phase 1 : touche `Ctrl+F11` qui s'enfonce (1s). Phase 2 : onde sonore (1s, ondes concentriques). Phase 3 : texte qui se révèle dans un mock input. Total ~3.5s, joué une fois puis figé.
- `PostProcessBeforeAfter.tsx` : carte 2 colonnes statique. Gauche `Avant` : `« hey peux tu me reformuler »`. Droite `Après` : `« Bonjour, pourriez-vous reformuler cette idée ? »`. Petite icône `sparkles` au milieu.
- `AppLogosStrip.tsx` : 3 SVG inline reconnaissables (utiliser Lucide ou des SVG génériques simples : message-square, file-text, mail). On évite les vrais logos de marques pour éviter les soucis de licence — texte i18n « Slack, Notion, Gmail, n'importe où ».

Pas de tests unitaires sur ces composants (purement visuels, snapshot fragile).

### Étape 5 — Composant Progress

**Nouveau fichier** : `src/components/onboarding/OnboardingProgress.tsx`

- Reçoit `{ current: number, total: number, onStepClick?: (step: number) => void }`.
- Rend `total` pastilles, la `current` est active (gradient violet), les précédentes cliquables (retour arrière), les suivantes désactivées.
- Animation hover sur les pastilles cliquables.

Test : `OnboardingProgress.test.tsx` rend 3 pastilles, current=2 → 2e pastille active, 1ère cliquable, 3e disabled.

### Étape 6 — Étapes du wizard

**Nouveaux fichiers** :

- `src/components/onboarding/steps/HeroStep.tsx`
- `src/components/onboarding/steps/CapabilitiesStep.tsx`
- `src/components/onboarding/steps/ChoiceStep.tsx`

Chaque étape :
- Reçoit `{ onContinue: () => void, onBack?: () => void, onSkipToChoice?: () => void }`.
- `ChoiceStep` reçoit en plus `{ systemInfo: SystemInfo | null, isEligible: boolean, onCloud: () => void, onLocal: () => void }`.
- Texte 100% via `useTranslation("billing")`.
- Layout cohérent : titre `vt-display`, sous-titre `text-muted-foreground`, contenu central, footer avec CTA droite + Retour gauche.

Tests :
- `HeroStep.test.tsx` : titre i18n présent, CTA Découvrir clique → onContinue appelé.
- `CapabilitiesStep.test.tsx` : 3 cartes rendues, badge `Cloud uniquement` présent, CTA Continuer.
- `ChoiceStep.test.tsx` : tests éligibilité (badge déconseillé) repris de `WelcomeScreen.test.tsx`, plus tests cloud-click → onCloud, local-click → onLocal.

### Étape 7 — Container OnboardingFlow

**Nouveau fichier** : `src/components/onboarding/OnboardingFlow.tsx`

- État local : `step: 1 | 2 | 3 | "local-wizard"`.
- Détecte `systemInfo` au mount via `invoke("get_system_info")`, comme l'actuel WelcomeScreen.
- Dispatch :
  - `Découvrir` (step 1) → step 2
  - `Continuer` (step 2) → step 3
  - `Passer` (step 1/2) → step 3
  - `Plus tard` (step 3, lien discret) → onComplete (sets onboarding_completed=true, ferme)
  - `Retour` → step précédent
  - `Cloud` (step 3) → `setOnboardingCompleted(true)` + `openAuthModal()` + `onComplete()`
  - `Local` (step 3) → step "local-wizard"
  - Wizard local termine → `setOnboardingCompleted(true)` + `onComplete()`
- Layout : `DialogPrimitive` plein écran, contenu `max-w-3xl`, `OnboardingProgress` en bas.
- Le wizard local existant (`OnboardingWizard`) est embarqué tel quel via composition.

Test : `OnboardingFlow.test.tsx`
- Mount → step 1 visible.
- Clique Découvrir → step 2.
- Clique Continuer → step 3.
- Clique Cloud → `openAuthModal` appelé + onComplete + setting updated.
- Clique Local → wizard rendu.
- `Passer` au step 1 → saute à step 3.

### Étape 8 — Intégration Dashboard

**Fichiers** : `src/components/Dashboard.tsx`

- Remplacer `import { WelcomeScreen } from "./billing/WelcomeScreen"` par `import { OnboardingFlow } from "./onboarding/OnboardingFlow"`.
- Remplacer `{showOnboarding && <WelcomeScreen onComplete={recheckOnboarding} />}` par `{showOnboarding && <OnboardingFlow onComplete={recheckOnboarding} />}`.
- Adapter l'appel à `useOnboardingCheck(settings, settingsLoaded, user)` pour passer `user` (depuis `useAuth`).

`WelcomeScreen` ancien : **supprimé** (et son test `.test.tsx` aussi, partiellement repris dans `ChoiceStep.test.tsx`).

### Étape 9 — i18n

**Fichiers** : `src/locales/fr/billing.json` + `src/locales/en/billing.json`

Ajouter sous `welcome` :
- `hero.title`, `hero.subtitle`, `hero.cta`
- `capabilities.title`, `capabilities.subtitle`
- `capabilities.hotkey.title`, `capabilities.hotkey.description`
- `capabilities.ai.title`, `capabilities.ai.description`, `capabilities.ai.badge`, `capabilities.ai.before_label`, `capabilities.ai.after_label`, `capabilities.ai.before_example`, `capabilities.ai.after_example`
- `capabilities.paste.title`, `capabilities.paste.description`
- `capabilities.continue`, `capabilities.skip`
- `choice.cloud.banner` (« 60 min gratuites · sans CB »)
- `choice.local.suitable` (« Pour utilisateurs avancés »)
- `choice.later` (« Plus tard »)
- `nav.skip`, `nav.back`, `nav.discover`, `nav.continue`

Réutilisation max des clés existantes `welcome.branch_a.*` et `welcome.branch_b.*` dans `ChoiceStep` pour limiter les ajouts.

### Étape 10 — Vérification

- `pnpm exec vitest run` → tous les tests vitest passent (existants + nouveaux).
- `pnpm exec tsc -p tsconfig.json --noEmit` → 0 erreur TS.
- `pnpm exec eslint .` → 0 erreur (warnings tolérés s'ils existent déjà).
- `cd src-tauri && cargo check` → compile (LIBCLANG + CMake déjà en path par convention dev).
  - Si Cargo échoue à cause de l'environnement, on documente — pas de modif Rust dans ce livrable de toute façon.

### Étape 11 — Commit + push

- Commit message : `feat(onboarding): cloud-first 3-step wizard with animated hero`
- Push sur `origin/feat/onboarding-cloud-first`.
- **Pas de PR créée** — le user testera manuellement la branche en local avant de décider.
- Message final à l'utilisateur : résumé + checklist de test manuel.

## Ordre d'exécution

1. Créer la branche (étape 1)
2. Settings field (étape 2)
3. i18n (étape 9) — fait tôt pour pouvoir utiliser les clés dans les composants
4. OnboardingProgress + tests (étape 5)
5. Illustrations (étape 4, pas de tests)
6. HeroStep + tests (étape 6 partie 1)
7. CapabilitiesStep + tests (étape 6 partie 2)
8. ChoiceStep + tests (étape 6 partie 3)
9. OnboardingFlow + tests (étape 7)
10. useOnboardingCheck remanié + tests (étape 3)
11. Dashboard intégration (étape 8)
12. Suppression de l'ancien WelcomeScreen
13. Verification (étape 10)
14. Commit + push (étape 11)

## Critères de done

- [ ] Tests vitest verts (tous, y compris les nouveaux)
- [ ] TypeScript strict OK
- [ ] ESLint OK
- [ ] L'onboarding peut être traversé Hero → Capabilities → Choice → Cloud (auth modal) OU Local (download wizard) OU Skip (3 navigations distinctes)
- [ ] Plus jamais reaffiché après complétion (settings flag persistant)
- [ ] Migration silencieuse fonctionne pour beta-testeurs (modèle existant → completed=true)
- [ ] Aucune string en dur, tout via i18n FR + EN
- [ ] Branche pushée sur origin avec un commit propre

## Test plan manuel (à faire par l'utilisateur)

1. `git checkout feat/onboarding-cloud-first` puis `pnpm tauri dev`
2. Supprimer le fichier `settings.json` (ou `onboarding_completed` à `false`) pour simuler un premier lancement
3. Vérifier l'enchaînement Hero → Capabilities → Choice
4. Tester chacun des 3 chemins : Cloud / Local / Plus tard
5. Vérifier que l'onboarding ne réapparaît pas après fermeture
6. Lancer avec un modèle local déjà installé → l'onboarding ne doit pas apparaître (migration silencieuse)
7. Tester en EN (changer locale) → texte traduit
8. Si machine sans GPU + <32GB → badge Déconseillé sur la carte Local visible
