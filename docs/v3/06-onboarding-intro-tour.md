# 06a — Intro tour in-app (post-setup, pré-signup)

> **Statut**: 🧊 En pause — reprise après 04-billing + 01-auth (besoin de crédits gratuits pour tester l'étape post-process côté local).
> **Cible**: v3.x.
> **Dépendances**: 04-billing (crédits offerts), 05-managed-transcription (post-process côté serveur pour users local-only).
> **Source**: brainstorming 2026-04-21 avec Yohann.

---

## Pourquoi on met en pause

L'étape clé du tour, c'est **montrer le post-process IA** (reformulation, correction, mail, etc.) parce que c'est la feature qui fait vraiment sentir la valeur du produit.

Problème : le post-process actuel **tape l'API OpenAI directement** (clé de l'utilisateur). Donc un utilisateur qui a choisi le mode **local uniquement** (sans clé payante) ne peut pas tester cette étape → l'onboarding devient incomplet / frustrant.

**Débloqué quand** :
- Les comptes utilisateurs existent (01-auth).
- On peut offrir des crédits gratuits aux premiers users (04-billing).
- Le post-process passe par un endpoint managé côté serveur (05-managed-transcription — à étendre au post-process texte).
- → À ce moment-là, **tout le monde** (y compris local-only) peut faire tourner le post-process une fois pendant le tour, gratis.

---

## Décisions déjà prises (à reprendre tel quel)

### Scope — 4 écrans après le setup

1. **A. Raccourcis par défaut** — présentation visuelle de :
   - `Ctrl+F11` → toggle enregistrement
   - `Ctrl+F12` → push-to-talk
   - `Ctrl+Alt+O` → afficher la fenêtre principale
2. **B. Dictée test** — l'utilisateur lit une phrase, on lance la vraie stack de transcription, on affiche le résultat.
3. **E. Post-process IA** — démo d'une reformulation sur la transcription produite à l'écran B (réutilise le résultat, ne ré-enregistre pas).
4. **Outro "découvre le reste"** — pointe vers les paramètres (auto-paste, mini-fenêtre, profils, vocabulaire, etc.) sans les détailler.

### Architecture — 2 wizards séparés

- **`OnboardingSetup`** (existant, `src/components/OnboardingWizard.tsx`) : bloquant, conditionné à l'absence de modèle/clé. Ne change pas.
- **`OnboardingTour`** (nouveau) : non-bloquant, skippable dès l'écran 1, conditionné à l'absence de `settings.tour_completed_at`. Re-lançable depuis un bouton "Refaire le tour" dans les paramètres (section Système ou Aide).
- Découplage propre : on peut itérer sur le tour (nouvelles features à montrer) sans toucher au setup.

### Étape B — dictée test : choix retenus

- **Texte à lire** : phrase produit naturelle avec ponctuation et accents.
  - Ex. FR : *"Aujourd'hui je teste Voice Tool, mon micro fonctionne bien et la transcription est rapide."*
  - Ex. EN : *"Today I'm testing Voice Tool, my microphone works well and transcription is fast."*
  - → À mettre dans `locales/{fr,en}.json` sous `onboardingTour.testDictationSample`.
- **Provider** : le **vrai** provider choisi au setup (pas un provider "rapide" forcé). C'est plus honnête, ça valide le setup réel.
- **Feedback** : texte transcrit + badge "✓ Ça marche !" (succès) ou erreur + bouton "Passer cette étape" (échec micro/perm/timeout).
- **Pas de diff automatique** avec la phrase cible (trop geek, bruit visuel).

### Étape E — post-process IA : à figer à la reprise

À la reprise, on devra trancher :
- Quel prompt de démo ? (reco initiale : "reformule pour un mail professionnel" — c'est le plus visuel, on voit le texte gagner en structure).
- On consomme les **crédits offerts** (04-billing) ou on fait un appel "invité" non facturé ?
- Affichage avant/après côte à côte (gauche : brut / droite : post-processé) avec un badge "🧠 IA".

---

## Questions ouvertes (à trancher à la reprise)

- [ ] Le tour se déclenche-t-il automatiquement **juste après** le setup, ou avec un léger délai (ex. 2 secondes pour laisser respirer) ?
- [ ] Le bouton "Refaire le tour" se met dans **Paramètres > Système** ou dans un **menu aide** dédié (nouveau) ?
- [ ] Est-ce que l'étape **B (dictée test)** est obligatoire ou skippable individuellement ? (reco : skippable, mais rendre le skip légèrement moins visible que le "Suivant").
- [ ] Si le modèle local est **encore en téléchargement** quand le tour démarre (cas edge où le setup se termine avant le download complet), on attend ou on skip l'étape B ?
- [ ] Format visuel des raccourcis : badges clavier stylisés (`⌃` + `F11`) ou illustration clavier schématique ? — question à poser en brainstorming visuel quand on reprend.
- [ ] Le tour doit-il aussi se déclencher pour les **utilisateurs existants** qui upgradent vers la version qui embarque le tour ? (reco : oui, une seule fois, via une migration qui set `tour_completed_at = null` uniquement pour les users sans ce champ).
- [ ] Analytics : on track la progression du tour (quel écran a été vu, où ils drop) ? Dépend du consentement analytics (06-onboarding.md > Tracking).

---

## Schéma de données (proposition)

Ajouter à `AppSettings.settings` :

```ts
tour_completed_at: string | null;  // ISO timestamp de complétion
tour_last_step_seen: number | null; // optionnel, pour reprendre si l'user a fermé au milieu
```

Gate d'affichage (pseudo) :

```ts
const shouldShowTour = settingsLoaded
  && !showOnboardingSetup              // le setup a priorité
  && settings.tour_completed_at == null;
```

Déclencher `tour_completed_at = new Date().toISOString()` à la fin OU au skip (dans les deux cas, on ne re-propose pas automatiquement).

---

## Fichiers touchés (prévisionnel)

- `src/components/OnboardingTour.tsx` (nouveau, ~400 lignes)
- `src/hooks/useOnboardingTour.ts` (nouveau, gate + actions)
- `src/components/Dashboard.tsx` (monter le tour après le setup)
- `src/lib/settings.ts` (nouveaux champs `tour_completed_at`, `tour_last_step_seen`)
- `src/locales/{fr,en}.json` (namespace `onboardingTour.*`)
- `src/components/settings/sections/SystemSection.tsx` (bouton "Refaire le tour")

---

## Alternatives écartées

- **Tout dans un seul wizard** (setup + tour d'un bloc) → écarté : mélange "bloquant" et "pédagogique", rend le setup lourd, casse la séparation d'états.
- **Post-process sur clé OpenAI locale uniquement** → écarté dès le brainstorming : exclut les users local-only, incohérent avec la promesse "offline possible".
- **Tour optionnel dès le setup** (case "je veux un tour" à cocher) → écarté : friction cognitive au moment où l'user veut juste *utiliser* l'app.

---

## Reprise : checklist

Quand on revient sur ce sujet (post 01-auth + 04-billing + 05-managed-transcription) :

1. Relire ce doc + `06-onboarding.md`.
2. Figer la partie "crédits offerts" pour l'étape E (quelle quantité, quelle durée, quel endpoint managé).
3. Répondre aux questions ouvertes ci-dessus.
4. Lancer `superpowers:brainstorming` pour finaliser le design visuel (écrans, mockups).
5. Ensuite `superpowers:writing-plans` pour le plan d'implémentation.
