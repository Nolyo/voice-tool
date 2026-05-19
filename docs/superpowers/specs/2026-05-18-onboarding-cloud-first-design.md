# Onboarding cloud-first — design

**Date** : 2026-05-18
**Auteur** : Claude (autonome, brief utilisateur)
**Statut** : Design proposé, à valider par l'utilisateur après revue

## Contexte

À ce jour (v3.0.0-beta.11), le premier lancement de Lexena affiche `WelcomeScreen` (`src/components/billing/WelcomeScreen.tsx`) qui propose deux choix côte à côte :

- Branche A « Créer mon compte » → ouvre `AuthModal` puis `onComplete()` (referme le welcome).
- Branche B « Continuer en local » → bascule sur `OnboardingWizard` qui télécharge `large-v3-turbo` (1.6 GB).

`useOnboardingCheck` n'affiche cette modale que si `transcription_provider === "Local"` ET aucun modèle local n'existe. Pour un nouvel utilisateur (défaut `Local`), elle s'affiche donc bien au premier lancement.

Côté billing : `BILLING_ENABLED = false`. Les checkouts Lemon Squeezy sont gelés. En revanche, le trial cloud (60 minutes, 30 jours) est auto-provisionné à la vérification de l'email (commit `a1e08cd`). Le levier marketing immédiat est donc **l'inscription** : compte créé → email vérifié → trial actif → l'utilisateur expérimente la transcription cloud + le post-process IA gratuitement.

## Problème

L'onboarding actuel est purement transactionnel :

1. Aucun **arc narratif** : le pitch produit n'apparaît nulle part. La modale demande un choix sans avoir montré ce que fait Lexena.
2. Le **killer feature** (hotkey → speak → paste dans l'app active) n'est jamais mis en avant.
3. Le post-process IA — qui est le différenciateur cloud — est mentionné dans une bullet de feature mais sans démonstration.
4. La carte Cloud porte un badge « Recommandé » sans émotion ni justification visible.
5. Aucune animation ni mise en scène : l'app paraît austère pour un produit premium positionné v3.0 « Public Beta ».

L'objectif du brief utilisateur est explicite : **donner envie de souscrire à Lexena Cloud**. Mécaniquement, BILLING_ENABLED étant à `false`, le KPI mesurable aujourd'hui est l'**activation du trial** (inscription + email vérifié). C'est ce que cible le redesign.

## Décisions

1. **Wizard à 3 étapes narratives** avec un état persistant (`current_step`), remplaçant la modale unique actuelle.
2. **Étape 1 — Hero animé** : titre, pitch en une phrase, démo SVG/CSS du flow `hotkey → micro → texte qui apparaît dans une fenêtre fictive`. CTA dominant `Découvrir` (continue). Lien discret `Passer` (continue jusqu'à step 3).
3. **Étape 2 — Capabilities** : 3 cartes alignées horizontalement.
   - Carte 1 « Raccourci global » : icône keyboard + libellé du hotkey courant (`Ctrl+F11` par défaut).
   - Carte 2 « IA post-process » : badge « Cloud uniquement », mini-demo statique (avant/après reformulation).
   - Carte 3 « Insertion partout » : icône paste + 3 logos d'apps reconnaissables (Slack, Notion, mail) en SVG.
   CTA `Continuer`.
4. **Étape 3 — Choix Cloud-first** : version rééquilibrée de l'actuel `WelcomeScreen`.
   - Cloud : carte large, gradient `--vt-violet`, badge animé « 60 min gratuites · sans CB », sous-titre « L'expérience complète », features filtrées (post-process IA en premier).
   - Local : carte sobre, framing honnête « Pour utilisateurs avancés ou usage 100% offline ».
   - Si machine inéligible (`!isLocalEligible`), Local reçoit le badge `Déconseillé` existant et la carte Cloud est élargie visuellement.
5. **Action finale**
   - Clic Cloud → `onboarding_completed = true`, ouvre `AuthModal`, ferme le wizard.
   - Clic Local → ouvre l'`OnboardingWizard` actuel (téléchargement modèle) ; à la fin du download, marque `onboarding_completed = true`.
   - Clic « Passer » sur n'importe quelle étape → ouvre direct l'étape 3 (on respecte le temps du power-user, on ne saute pas le choix structurant).
6. **Persistance** : nouveau champ `onboarding_completed: boolean` (défaut `false`) dans `AppSettings.settings`. Le hook `useOnboardingCheck` lit ce flag à la place de la logique actuelle. Migration silencieuse au boot : si `signed-in` OU `any_local_model_exists` OU `transcription_provider !== "Local"` → set `onboarding_completed = true` (couvre les beta-testeurs existants).
7. **Animations** : CSS uniquement (keyframes + Tailwind), pas de framer-motion (hors deps). Réutilisation des tokens `vt-anim-fade-up`, gradients OKLCH `var(--vt-violet)`, `var(--vt-accent)`.
8. **i18n** : nouveaux clés sous `billing.welcome.*` (déjà namespace utilisé), pas de nouvelle locale. Pas d'emoji hardcodé (cf. feedback i18n).

## Architecture

```
src/components/onboarding/
├── OnboardingFlow.tsx           # Container, gère current_step + dispatch
├── OnboardingProgress.tsx       # Indicateur pastilles 1/2/3
├── steps/
│   ├── HeroStep.tsx             # Étape 1
│   ├── CapabilitiesStep.tsx     # Étape 2
│   └── ChoiceStep.tsx           # Étape 3 (replace l'actuel WelcomeScreen)
└── illustrations/
    ├── HotkeyToTextDemo.tsx     # Animation SVG/CSS, hero step
    └── PostProcessBeforeAfter.tsx
```

Le `OnboardingWizard` existant (download large-v3-turbo) reste tel quel — il est invoqué par `ChoiceStep` quand l'utilisateur choisit Local. C'est le « step 4 » optionnel du flow.

L'`AuthModal` reste tel quel — il est ouvert via `useAuth().openAuthModal()` quand l'utilisateur choisit Cloud.

Le `Dashboard.tsx` change minimalement :
- `WelcomeScreen` remplacé par `OnboardingFlow`
- `useOnboardingCheck` lit `settings.onboarding_completed` (avec fallback intelligent pour migration)

## Diagramme de flux

```
Premier lancement
    │
    ├─ Migration: any_model || signed_in || provider!=Local → onboarding_completed=true → STOP
    │
    └─ Sinon → OnboardingFlow s'ouvre
         │
         ▼
    [Step 1: Hero] ─ Passer ─────────────┐
         │                                │
         ▼ Découvrir                      │
    [Step 2: Capabilities] ─ Passer ─────┤
         │                                │
         ▼ Continuer                      │
    [Step 3: Choice] ◀───────────────────┘
         │
         ├─ Cloud → set completed=true → close + open AuthModal
         │
         └─ Local → OnboardingWizard (download model)
                       │
                       ├─ Download success → set completed=true → close
                       └─ Back arrow → retour Step 3
```

## Composants

### OnboardingFlow

- État local : `step: 1 | 2 | 3 | "local-wizard"` + `systemInfo: SystemInfo | null` (détection au mount).
- API : `<OnboardingFlow onComplete={recheckOnboarding} />`.
- Persiste `onboarding_completed = true` quand l'utilisateur sort par Cloud OU finit le download local.
- Rendu : `DialogPrimitive` plein écran, fond `bg-black/60 backdrop-blur-sm`, contenu `max-w-3xl`.
- En haut à droite : bouton `Passer` (sauf step 3, où il devient `Plus tard` et marque `completed=true` + provider laissé sur Local sans modèle — on assume que l'utilisateur sait ce qu'il fait).
- En bas : `OnboardingProgress` (3 pastilles).

### HeroStep

- Headline `t("onboarding.hero.title")` : ex. « Parle, et le texte apparaît partout. »
- Subhead `t("onboarding.hero.subtitle")` : ex. « Un raccourci global, une dictée précise, un coup de pouce IA. »
- `HotkeyToTextDemo` : animation CSS qui boucle (Ctrl+F11 pressé → onde sonore → texte qui se tape dans un mock chat input « Hello, this is Lexena working »).
- CTA primaire `Découvrir`.

### CapabilitiesStep

- 3 cartes :
  - **Raccourci global** : `Cmd` icon, libellé hotkey dynamique (lit `settings.record_hotkey`).
  - **IA post-process** : badge `Cloud uniquement` violet, mini exemple « hey peux tu me reformuler l'idée » → « Bonjour, pourriez-vous reformuler cette idée ? ».
  - **Insertion partout** : icône paste, 3 mini-logos SVG (Slack, Notion, mail).
- CTA primaire `Continuer`. CTA secondaire `Retour`.

### ChoiceStep

Reprend la structure de `WelcomeScreen` actuel avec :

- Cloud card visuellement promue :
  - Gradient background `linear-gradient(135deg, oklch(from var(--vt-violet) l c h / 0.18), oklch(from var(--vt-accent) l c h / 0.10))`
  - Badge `60 min gratuites · sans CB` en haut, animé (pulse léger)
  - Liste features réordonnée : `Post-process IA inclus` en premier
  - CTA primaire (taille XL)
- Local card sobre :
  - Border simple, fond `bg-card`
  - Liste features identique à l'actuel
  - CTA secondaire (variant outline)
  - Badge `Déconseillé` si `!isLocalEligible` (reprend l'actuel)
- Bouton `Retour` en haut à gauche pour revenir à step 2.

### Migration au boot (one-shot)

Dans `useOnboardingCheck` :

```ts
useEffect(() => {
  if (!isLoaded) return;
  if (settings.onboarding_completed) return;

  // Soft migration : si l'utilisateur a déjà tout ce qu'il faut pour
  // utiliser l'app, on ne montre pas l'onboarding (cas beta-testeur).
  let cancelled = false;
  Promise.all([
    invoke<boolean>("any_local_model_exists").catch(() => false),
    // user déjà connu via useAuth (ailleurs)
  ]).then(([anyModel]) => {
    if (cancelled) return;
    if (anyModel || user || settings.transcription_provider !== "Local") {
      updateSetting("onboarding_completed", true);
    }
  });
  return () => { cancelled = true; };
}, [isLoaded, settings.onboarding_completed]);
```

## Tests

- `OnboardingFlow.test.tsx` : tests navigation step 1 → 2 → 3 → cloud / local.
- `ChoiceStep.test.tsx` : reprend les tests existants de `WelcomeScreen.test.tsx` (4 tests sur le badge éligibilité), adaptés au nouveau composant.
- `HeroStep.test.tsx` + `CapabilitiesStep.test.tsx` : tests de rendu i18n + CTA disponibles.
- `useOnboardingCheck.test.tsx` : nouveau test pour la migration (modèle existant → completed=true).

Tests UI uniquement (vitest + testing-library). Pas de E2E Tauri — documenté dans le test plan manuel.

## Risques / trade-offs

| Risque | Mitigation |
|--------|------------|
| Régression sur le flow local (le wizard est déjà bien rodé) | Réutilisation de `OnboardingWizard` existant tel quel. Pas de modif du code Rust. |
| Beta-testeurs voient l'onboarding revenir | Migration silencieuse au boot (any_model OR signed_in OR provider != Local). |
| Animations CSS perçues comme « lourdes » | Animations courtes (1.5-2s), pas de boucle infinie sauf hero demo (réduit à 1 cycle puis figé). |
| Charge de travail i18n | Pas de nouvelle locale, juste 12-15 clés ajoutées sous `billing.welcome.*`. EN + FR. |
| Risque que l'utilisateur ferme la modale au step 1 (Escape) | `onEscapeKeyDown` est déjà `preventDefault`. On garde. |
| Démo SVG difficile à rendre joli sans framer-motion | Garder simple : keyframes CSS sur translate + opacity, pas d'easing complexe. |

## Hors scope (volontairement)

- Coach-mark « première utilisation » sur le Dashboard après onboarding (idée séduisante mais nécessite un état Dashboard persistant + listener `audio-captured`). **Reporté à une suite si l'utilisateur valide ce premier livrable.**
- Tutoriel interactif clavier (cf. Linear). Hors scope.
- Sons d'onboarding. Hors scope.
- Sélection device micro dans l'onboarding. Hors scope (déjà accessible dans Settings).
- Analytics PostHog événements onboarding. Hors scope (pas dans les deps actuelles).

## Critères de succès

- L'onboarding **raconte une histoire** (Hero → Capabilities → Choice) au lieu de poser une question abrupte.
- La carte Cloud du Choice est visuellement **2× plus dominante** que la carte Local (gradient + taille + badge animé).
- Le tutoiement et le ton restent cohérents avec l'app existante (français-first, EN traduit).
- Aucun blocage : un utilisateur peut toujours `Passer` ou `Plus tard` (respecte l'autonomie).
- Migration silencieuse : aucun beta-tester ne voit l'onboarding réapparaître après mise à jour.

## Auto-review

- ✅ Pas de placeholder TBD/TODO dans le doc.
- ✅ Pas de contradiction (Hero anime, Capabilities détaille, Choice convertit).
- ✅ Scope : ~6 nouveaux composants + 1 hook modifié + 1 settings field + ~15 clés i18n. Tient dans un seul plan d'implémentation.
- ✅ Ambiguïté : aucune décision laissée ouverte (animations CSS, framer-motion exclu, BILLING_ENABLED ignoré, KPI = trial activation).
