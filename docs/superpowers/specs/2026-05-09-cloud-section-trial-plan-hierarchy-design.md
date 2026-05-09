# Cloud Section — Trial + Plan Hierarchy — Design

> **Date** : 2026-05-09
> **Sub-épique** : v3 / 04-billing (UI suite directe de PR #44 + 2026-05-05 trial-auto-provisioning)
> **Statut** : Spec validé, prêt pour writing-plans

## Contexte

Depuis l'activation du système premium Lemon Squeezy (ADR 0013, livré 2026-05-06), un user qui souscrit à un plan **pendant son essai gratuit de 60 minutes** voit deux blocs côte à côte dans `Settings → Cloud` :

```
Essai gratuit en cours
  Minutes restantes : 49
  Expire le : 03/06/2026

Plan starter
  Minutes incluses ce mois : 400
  Minutes consommées : 5
  Minutes restantes : 395
```

Trois problèmes :

1. **L'user a l'impression qu'il y a deux quotas indépendants** alors que le backend en consomme un seul à la fois. La règle `trial > quota > overage > deny` (`workers/transcription-api/src/usage.ts:78`) n'est jamais énoncée dans l'UI.
2. **Le label "Minutes consommées : 5" du Plan starter est trompeur.** Il vient de `usage_summary.units_total` qui agrège les events de toutes sources (`trial`, `quota`, `overage`). Tant que le trial est actif, ces 5 minutes ont en réalité été débitées du trial — pas du plan. Le plan affiche un compteur qui ne lui appartient pas.
3. **Le `QuotaCounter` du header (`src/components/cloud/QuotaCounter.tsx:39`) souffre du même bug** : `plan.quota_minutes - monthly_minutes_used` déduit aussi les minutes trial du mois en cours.

## Objectif

Refondre `Settings → Cloud` en une **hiérarchie unique "Plan principal + bonus essai en sous-élément"** qui :

- Conserve la sémantique business actuelle (priorité trial > plan, l'user ne perd pas ses minutes de trial).
- Affiche un compteur "Minutes ce mois" du plan **fidèle** (basé sur `events.source='quota'` uniquement).
- Énonce explicitement l'ordre de consommation pour lever l'ambiguïté.
- Corrige le calcul `QuotaCounter` du header pour la même raison.

100% UI/UX. Aucun changement de la logique de débit côté worker. Aucune migration de schéma DB.

## Décisions actées (brainstorm 2026-05-09)

| # | Décision | Rationale |
|---|---|---|
| 1 | **Sémantique business inchangée** : trial reste actif en parallèle du plan, consommé en priorité | L'user ne perd pas ses minutes de trial à la souscription ; pas de migration ni de logique d'absorption |
| 2 | **UI : hiérarchie plan principal + bonus en sous-élément** | Conserve l'info, retire l'impression de double-comptabilité |
| 3 | **Renommage "Essai gratuit en cours" → "Bonus de bienvenue"** | Moins anxiogène, lit comme un avantage et non un compte à rebours |
| 4 | **Note explicite "Consommées en priorité avant ton plan"** sous le bloc bonus | Lève l'ambiguïté de l'ordre de débit |
| 5 | **Breakdown des minutes consommées par `source` côté client**, via une 4ᵉ requête sur `usage_events` | Évite migration DB ; payload léger (~quelques centaines d'events/mois max) |
| 6 | **Pas de vue Supabase `usage_summary_by_source`** pour cette itération | YAGNI — un seul consommateur (CloudContext). À envisager si le breakdown devient utile ailleurs (admin dashboard, exports) |
| 7 | **Overage hors scope** | L'UI actuelle ne traite pas l'overage non plus ; à reprendre dans une vraie pass billing dédiée |
| 8 | **Pas de feature flag** | Fix UI pur, pas de changement de comportement business |

## Architecture

**Trois fichiers modifiés, deux nouveaux i18n keys, zero migration DB.**

### Fichiers modifiés

- `src/contexts/CloudContext.tsx` — ajout du fetch `usage_events` mensuel groupé par source ; nouveau champ `monthly_minutes_breakdown` exposé.
- `src/components/settings/sections/CloudSection.tsx` — restructuration en bloc unique "Plan + bonus".
- `src/components/cloud/QuotaCounter.tsx` — corriger le calcul `remaining` pour utiliser `breakdown.quota` au lieu de `monthly_minutes_used`.

### Fichiers étendus

- `src/locales/fr/cloud.json` — ajout du namespace `settings.bonus.*` + `settings.plan.minutes_progress*`.
- `src/locales/en/cloud.json` — pendants EN.

### Fichiers nouveaux (tests)

- `src/lib/usage/breakdown.ts` (ou inline dans `CloudContext`) + `breakdown.test.ts` — helper pur pour agréger `usage_events` par source.
- `src/components/settings/sections/CloudSection.test.tsx` — RTL.
- `src/components/cloud/QuotaCounter.test.tsx` — RTL.

## Layout cible

### État principal (trial actif + plan actif)

```
Service cloud Lexena

┌─ Plan starter ──────────────────────────────┐
│                                              │
│  Minutes ce mois         0 / 400  (0 %)     │
│  ▏░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░     │
│                                              │
│  ─────────────────────────────────────       │
│                                              │
│  + Bonus de bienvenue                        │
│    49 min restantes · expire le 03/06        │
│    Consommées en priorité avant ton plan.    │
│                                              │
└──────────────────────────────────────────────┘

Abonnement
  Plan starter — 400 minutes incluses par mois
  [Gérer mon abonnement]

[Rafraîchir]
```

### Autres états

| État | Affichage |
|---|---|
| **Trial seul** (pas encore souscrit) | Bloc unique "Bonus de bienvenue" avec CTA `SubscribeButton`. Équivalent au comportement actuel sans le titre "Essai gratuit en cours". |
| **Plan seul** (trial expiré ou épuisé) | Bloc Plan sans le sous-bloc bonus. Compteur "Minutes ce mois" basé sur `breakdown.quota`. |
| **Rien** (signed-in mais ni trial ni plan) | Message `nothing_active` + `SubscribeButton` (inchangé). |
| **Loading** | Skeleton "Chargement…" (inchangé). |
| **Pas signed-in** | Message `signin_required` (inchangé). |

## Contrat de données

### Nouveau champ exposé par `CloudContext`

```ts
interface MonthlyBreakdown {
  trial: number;     // events.source='trial'   AND year_month=current
  quota: number;     // events.source='quota'   AND year_month=current
  overage: number;   // events.source='overage' AND year_month=current
}

// Ajout au CloudContextValue existant :
monthly_minutes_breakdown: MonthlyBreakdown;
```

`monthly_minutes_used` reste exposé pour rétrocompatibilité (= `breakdown.trial + breakdown.quota + breakdown.overage`).

### Requête additionnelle dans `refreshUsage`

```ts
supabase
  .from("usage_events")
  .select("source, units")
  .eq("user_id", user.id)
  .eq("kind", "transcription")
  .gte("created_at", startOfMonthUtc)   // 1er du mois courant à 00:00 UTC
  .lt("created_at", startOfNextMonthUtc) // 1er du mois suivant à 00:00 UTC
```

Aggrégée côté client en une boucle simple, exposée via `breakdown`.

### Calculs UI dérivés

| Champ affiché | Source |
|---|---|
| Compteur principal `X / 400` | `Math.floor(breakdown.quota)` / `plan.quota_minutes` |
| Barre de progression | `min(breakdown.quota / plan.quota_minutes, 1) * 100` |
| Bonus "N min restantes" | `Math.floor(trial.minutes_remaining)` (vue `trial_status`, inchangé) |
| Bonus "expire le" | `trial.expires_at` (inchangé) |
| QuotaCounter pill — trial actif | `trial.minutes_remaining` ou `daysUntil(expires_at)` (inchangé) |
| QuotaCounter pill — plan only | `plan.quota_minutes - Math.floor(breakdown.quota)` (corrigé) |

## i18n

### `src/locales/fr/cloud.json` — ajouts dans `settings`

```jsonc
"plan": {
  "heading": "Plan {{plan}}",
  "minutes_progress": "Minutes ce mois",
  "minutes_progress_value": "{{used}} / {{quota}}",
  "quota_minutes": "Minutes incluses ce mois",
  "minutes_used": "Minutes consommées",
  "minutes_remaining": "Minutes restantes"
},
"bonus": {
  "heading": "Bonus de bienvenue",
  "minutes_remaining_one": "{{count}} min restante · expire le {{date}}",
  "minutes_remaining_other": "{{count}} min restantes · expire le {{date}}",
  "consumed_first_note": "Consommées en priorité avant ton plan."
}
```

### `src/locales/en/cloud.json` — pendants

```jsonc
"plan": {
  "heading": "{{plan}} plan",
  "minutes_progress": "Minutes this month",
  "minutes_progress_value": "{{used}} / {{quota}}",
  // …
},
"bonus": {
  "heading": "Welcome bonus",
  "minutes_remaining_one": "{{count}} min left · expires on {{date}}",
  "minutes_remaining_other": "{{count}} min left · expires on {{date}}",
  "consumed_first_note": "Consumed before your plan minutes."
}
```

### Clés à supprimer

`settings.trial.heading`, `settings.trial.minutes_remaining`, `settings.trial.expires_at` ne sont plus utilisées après la refonte (`CloudSection` est leur seul consommateur — à confirmer par grep avant suppression). À nettoyer pour éviter le code mort. Les clés top-level `trial.*` (utilisées par `QuotaCounter` pour le pill du header) restent intactes.

## Cas limites

1. **Trial expire mid-month** : la vue `trial_status` recalcule `is_active = (minutes_consumed < minutes_granted AND expires_at > NOW())`. Le sous-bloc bonus disparaît automatiquement au refresh suivant. Les events post-expiration ont `source='quota'`, donc `breakdown.quota` reflète immédiatement la consommation post-trial.

2. **Trial épuisé en minutes mais pas en temps** : idem, `is_active = false` via la même vue. Sous-bloc disparaît dès le dernier event `source='trial'`.

3. **Subscription `paused` / `past_due` / `cancelled`** : `CloudContext` filtre déjà `sub.status === "active"` → `plan = null`. Le bloc Plan disparaît. Si trial encore actif, le bloc bonus reste seul + `SubscribeButton`. Cohérent avec l'état "trial seul".

4. **Overage** (`breakdown.overage > 0`) : si `breakdown.quota >= plan.quota_minutes`, la barre est clampée à 100%. **L'overage n'est PAS signalé dans cette itération** — l'UI actuelle ne le fait pas non plus. À traiter dans une vraie pass billing dédiée. Si overage > 0, il s'ajoute simplement au total dans `monthly_minutes_used` mais n'apparaît dans aucun compteur visible. *TODO suivant.*

5. **First render avant que `usage_events` ne réponde** : `breakdown` initialisé à `{trial: 0, quota: 0, overage: 0}`. Affichage transitoire `0 / 400` puis valeurs réelles. Acceptable.

6. **Trial pas encore créé** (user juste signed-up, email pas vérifié — devrait être rare depuis l'auto-provisioning du 2026-05-05) : `trial_status` retourne `null` → tombe sur l'état `nothing_active`.

## Tests

### Test unitaire `computeBreakdown`

Helper pur exporté depuis `src/lib/usage/breakdown.ts` (ou inline dans `CloudContext`).

| # | Cas | Attendu |
|---|---|---|
| 1 | Liste vide | `{trial: 0, quota: 0, overage: 0}` |
| 2 | Mix trial+quota+overage | Somme exacte par source |
| 3 | Source inconnue (forward-compat) | Ignorée |
| 4 | Units = 0 | Comptés (events legitimes à 0) |

### Test composant `CloudSection` (Vitest + RTL, mock `useUsage`)

| # | Cas | Attendu |
|---|---|---|
| 1 | Trial actif + plan actif | Bloc Plan + sous-bloc bonus visibles, compteur `breakdown.quota / quota_minutes` |
| 2 | Trial expiré + plan actif | Bloc Plan seul, sous-bloc bonus absent |
| 3 | Trial actif + pas de plan | Bloc bonus seul + `SubscribeButton` |
| 4 | Rien | Message `nothing_active` + `SubscribeButton` |
| 5 | Loading | Skeleton |
| 6 | Pas signed-in | Message `signin_required` |

### Test composant `QuotaCounter` (Vitest + RTL)

| # | Cas | Attendu |
|---|---|---|
| 1 | Trial actif | Pill avec minutes/jours du trial (inchangé) |
| 2 | Trial expiré + plan, `breakdown.quota = 50`, `quota_minutes = 400` | Pill `350 min restantes` |
| 3 | Trial expiré + plan, `breakdown.quota = 0` mais `breakdown.trial = 30` (résiduel mid-month) | Pill `400 min restantes` (le trial mid-month NE pollue PAS le compteur plan) |
| 4 | `hasCloudSelected = false` | Pas de pill (inchangé) |

### Pas de test backend

Le worker `transcription-api` reste inchangé. La logique `trial > quota > overage > deny` est déjà couverte par les tests existants du worker (hors scope de ce spec).

## Non-buts

- ❌ Modifier la sémantique de débit (trial > plan reste).
- ❌ Migrer `usage_summary` pour stocker un breakdown par source (YAGNI, un seul consommateur).
- ❌ Gérer l'affichage de l'overage (à faire dans une pass billing dédiée).
- ❌ Toucher au webhook Lemon Squeezy ou aux Edge Functions de billing.
- ❌ Exploiter `subscriptions.trial_ends_at` (reste inutilisée — c'est une colonne du modèle Lemon Squeezy, pas notre trial maison).
- ❌ Feature flag / rollout progressif — fix UI pur déployé en l'état.

## Rollout

Pas de feature flag. Pas de migration. Pas de coordination backend.

Merge → version v3.x suivante → users voient l'UI corrigée au prochain refresh `Settings → Cloud`.

## Suite

Plan d'implémentation à rédiger via `superpowers:writing-plans` après validation utilisateur de ce spec.
