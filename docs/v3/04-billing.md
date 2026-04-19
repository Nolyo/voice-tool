# 04 — Billing & gating premium

> **Statut**: 📝 Stub. POC technique fait.
> **Cible**: v3.0 (gating minimal) → v3.1 (offre complète).
> **Dépendances**: 01.

---

## Décisions déjà actées (cf. EPIC.md)

- Provider: **Lemon Squeezy** (Merchant of Record) ([ADR 0001](decisions/0001-lemonsqueezy-vs-stripe.md))
- POC technique fonctionnel: voir [`docs/research/lemonsqueezy-poc/`](../research/lemonsqueezy-poc/)

---

## Question critique encore ouverte

**Quelle est l'offre premium exacte?** Cette décision détermine tout (gating, pricing, marketing).

Orientations possibles à challenger en session dédiée:

| Modèle | Description | Avantage | Inconvénient |
|---|---|---|---|
| **Sync only** | Free reste 100% local. Payant = sync cloud. | Différenciation claire. | Sync seule a une valeur perçue limitée. |
| **Sync + service managé** | Free = local. Payant = sync + transcription via notre API (BYOK plus nécessaire). | Forte valeur ajoutée. | Coût opérationnel proxy à modéliser. |
| **Free tier limité** | Free = sync + tout, mais limites (ex: 100 notes, 2 devices). Pro = illimité. | Standard SaaS, conversion connue. | Risque "free trop confortable" ⇒ pas de conversion. |
| **Donation-ware** | Tout gratuit. Abonnement = soutien sans contrepartie. | Aligné philosophie open source. | Conversion très faible historiquement. |
| **Hybride** | Sync gratuit + bonus payants (modèles cloud premium, partage, team, support…) | Bon compromis. | Complexité du pricing à expliquer. |

→ À brainstormer dans une session dédiée.

---

## Ce qui est déjà couvert par le POC

- Schéma `subscriptions` Postgres + RLS
- Edge Function webhook avec HMAC SHA-256 timing-safe
- Idempotence via `upsert on conflict provider_subscription_id`
- Commande Tauri `open_checkout` (navigateur système)
- Composant React `SubscribeButton`
- Test fixture + script de signature

À reprendre tel quel pour v3.0, sous réserve d'audit final.

---

## Questions encore à trancher

### Pricing

- [ ] Prix mensuel? annuel?
- [ ] Discount annuel (typique: -20%)
- [ ] Trial gratuit (14 jours)?
- [ ] Plan unique ou plusieurs tiers (Pro / Team / Enterprise)?

### Gating technique

- [ ] Cache local de la subscription (durée? refresh?)
- [ ] Mode dégradé en cas de souci backend (grâce period?)
- [ ] Que se passe-t-il quand l'abonnement expire? (sync s'arrête, données restent accessibles? read-only?)

### Customer portal

- [ ] Lemon Squeezy fournit un portail user (gestion abonnement, factures, annulation)
- [ ] Lien depuis l'app vers ce portail
- [ ] Resync de l'état après modification dans le portail (webhook `subscription_updated`)

### Cas spéciaux

- [ ] Refund / chargeback: sync s'arrête immédiatement ou attendre `subscription_expired`?
- [ ] User crée son compte AVANT de souscrire (réconciliation post-signup)
- [ ] User souscrit sans avoir créé de compte (réconciliation par email post-signup)
- [ ] Multi-seat / team plans: hors v3.0, à acter pour plus tard

### Tracking & analytics

- [ ] MRR / churn dashboard (Lemon Squeezy fournit le sien, suffisant?)
- [ ] Conversion funnel (visite → signup → trial → paid)
- [ ] Pas de tracking PII sans consentement (RGPD)

### Conformité

- [ ] DPA Lemon Squeezy signé
- [ ] Privacy policy mentionnant Lemon Squeezy
- [ ] Mentions légales (en tant que vendeur, même si MoR — à confirmer avec un comptable)
- [ ] Facturation: Lemon Squeezy émet les factures, mais à toi d'avoir un suivi compta

---

## Livrables attendus

1. Offre premium définie
2. Migration POC vers `src-tauri` + Supabase prod
3. Customer portal accessible depuis l'app
4. Tests E2E du flow checkout → webhook → gating
5. Doc utilisateur (page pricing, FAQ abonnement)
6. ADR `0009-premium-offer.md`
