# 0014 — Trial mechanics

> **Statut**: Acté.
> **Date**: 2026-04-27 (spec) / 2026-05-05 (ADR rédigé en clôture sous-épique 04).
> **Source canonique**: [`docs/superpowers/specs/2026-04-27-v3-premium-offer-design.md`](../../superpowers/specs/2026-04-27-v3-premium-offer-design.md), section 5.

## Contexte

L'utilisateur paywall-cloud sans avoir essayé = friction et taux de conversion bas. Inversement, un trial ouvert sans cap = abus.

## Décision

- **60 minutes** de crédit cloud + **30 jours** calendaires.
- Premier des deux qui s'épuise termine l'essai.
- **Sans CB demandée**.
- Crédit accordé **à la vérification email** (déjà implémenté via trigger Postgres `grant_trial_credits()`, livré PR #45).
- Hard expiry à J+30 ou 60 min consommées : popup non-bloquante (cf. ADR `0015` à venir et composant `ExpirationPopup`).

## Anti-abus (livré sous-épique 01)

Defense in depth :
1. Normalisation email canonique (`enforce_email_canonical_unique`)
2. Captcha Turnstile au signup
3. Email verification obligatoire avant crédit
4. Rate limit IP signup
5. Blocklist domaines jetables (`src/lib/disposable-domains.ts`)

Signal passif : device fingerprint partagé (table `user_devices`), sans blocage automatique en v3.2.

## Conséquences

- L'app affiche **la valeur la plus contraignante** dans le compteur principal (cf. `QuotaCounter`).
- Pas de re-crédit automatique après expiration. Re-crédit ponctuel possible via support si cas légitime.

## Alternatives écartées

Cf. spec § 5 et § 13.
