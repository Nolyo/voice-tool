# ADR 0001 — Lemon Squeezy comme provider de paiement

- **Statut**: Accepté
- **Date**: 2026-04-19
- **Contexte de la décision**: session de brainstorming v3

## Contexte

La v3 introduit une offre payante. Il faut un provider qui:
- Accepte les paiements internationaux (Visa/Mastercard/Apple Pay/Google Pay)
- Gère les abonnements récurrents
- Fournit un webhook fiable
- Intègre proprement avec une stack Tauri + Supabase
- N'impose pas une charge de conformité fiscale ingérable pour un dev solo français

Trois alternatives sérieuses ont été évaluées:

| Critère | Lemon Squeezy (MoR) | Stripe direct | Paddle (MoR) |
|---|---|---|---|
| Frais | ~5% + 50¢ | ~2.9% + 30¢ (+ 0.5% Stripe Tax) | ~5% |
| TVA EU MOSS | LS s'en charge | À ta charge | Paddle s'en charge |
| Sales tax US | LS gère | À ta charge | Paddle gère |
| Facturation | LS génère | À ta charge | Paddle génère |
| API/webhooks maturité | Correct | Excellent | Très bon |
| Customer portal | Basique | Excellent | Très bon |
| Customisation checkout | Limité | Maximal | Bon |
| Acquis par | **Stripe (2024)** | — | Indépendant |

## Décision

On retient **Lemon Squeezy**.

## Justification

- **MoR (Merchant of Record)** = Lemon Squeezy gère intégralement la TVA EU MOSS, la sales tax US (multi-états post-Wayfair), et les autres juridictions. Pour un dev solo français, c'est plusieurs dizaines d'heures par an économisées en déclarations et compliance.
- Le surcoût de ~2% en frais comparé à Stripe est largement compensé par le temps gagné.
- **Un POC technique fonctionnel existe déjà** (`docs/research/lemonsqueezy-poc/`): webhook HMAC SHA-256, idempotence, RLS Supabase. La techno est validée bout-en-bout.
- L'alternative crédible était Paddle (plus mature pour le SaaS récurrent), mais le POC Lemon Squeezy étant déjà fait, refaire un POC Paddle = coût de migration sans gain démontré pour notre cas.

## Conséquences

### Positives
- Zéro charge de compliance fiscale internationale
- Lemon Squeezy émet les factures pour nous
- Time-to-market réduit (POC déjà fait)

### Négatives / risques acceptés
- **Lemon Squeezy a été racheté par Stripe en 2024** — incertitude stratégique sur l'avenir du produit. Mitigation: l'archi (webhooks normalisés, table `subscriptions` agnostique) permet une migration vers Stripe direct ou Paddle si Lemon Squeezy était abandonné.
- Customisation du checkout limitée vs Stripe. Acceptable pour notre besoin (page checkout simple).
- Customer portal Lemon Squeezy plus basique. Acceptable pour v3.0.

## Décisions reportées

- Migration éventuelle vers Paddle ou Stripe direct si: rachat Stripe se traduit par fin de vie de Lemon Squeezy, OU notre volume devient assez gros pour rendre les 2% de fees significatifs (>10k€/mois).
