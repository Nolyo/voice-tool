# 0013 — Premium offer (positionnement et grille tarifaire)

> **Statut**: Acté.
> **Date**: 2026-04-27 (spec) / 2026-05-05 (ADR rédigé en clôture sous-épique 04).
> **Source canonique**: [`docs/archive/superpowers/specs/2026-04-27-v3-premium-offer-design.md`](../../archive/superpowers/specs/2026-04-27-v3-premium-offer-design.md), sections 3 et 4.

## Contexte

Lexena (ex-Voice Tool) v3.0 a livré l'auth + sync settings + service managé transcription côté infra (Worker + trial). Reste à figer **quel produit** est vendu.

## Décision

Deux modes mutuellement exclusifs :

| Mode | Tarif | Périmètre |
|---|---|---|
| **Local** | Gratuit illimité, open source | Transcription brute (whisper-rs offline) |
| **Lexena Cloud** | Abonnement 2 tiers | Transcription managée (Groq Whisper turbo) + post-process IA (OpenAI) |

BYOK (OpenAI/Groq) **retiré** au lancement v3.2 (livré PR #42).

### Grille tarifaire

| Plan | Mensuel | Annuel (-18%) | Quota | Overage |
|---|---|---|---|---|
| **Starter** | 5€/mois | 49€/an | 400 min/mois | 0,03€/min |
| **Pro** | 9€/mois | 89€/an | 1000 min/mois | 0,02€/min |

Prix TTC (Lemon Squeezy = MoR pour la TVA). Cycle de facturation : mois calendaire roulant. Minutes décomptées sur appels API réussis uniquement, à la seconde près.

### Marges nettes (par user à 100% du quota inclus)

| Plan | Revenu | Coût provider* | Frais Lemon Squeezy (~5%) | Marge nette |
|---|---|---|---|---|
| Starter | 5€ | 0,40€ | 0,25€ | ~4,35€ |
| Pro | 9€ | 1,00€ | 0,45€ | ~7,55€ |

*Hypothèse Groq Whisper turbo à $0,001/min.

## Conséquences

- Le code Tauri/React route uniquement vers `LexenaCloud` ou `local` (cf. `CloudContext.mode`).
- Les variant_ids Lemon Squeezy doivent matcher 4 variantes (Starter mensuel/annuel, Pro mensuel/annuel) — voir `src/lib/billing/plans.ts`.
- Plan Team/Enterprise et plan illimité : hors-périmètre v3.2, à reconsidérer post-traction.

## Alternatives écartées

Cf. spec § 4 et § 13.
