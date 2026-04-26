# 06 — Onboarding & marketing premium

> **Statut**: 📝 Stub.
> **Cible**: v3.0 (minimal) → v3.1 (complet).
> **Dépendances**: 04 (offre figée).

---

## Périmètre

Tout ce qui transforme un user de l'app gratuite en utilisateur informé du compte/du premium.

---

## Questions à trancher

### Site marketing

- [ ] Domaine final? (voice-tool.com? voicetool.app?)
- [ ] Stack site: Astro? Next.js? Hugo? Plain HTML?
- [ ] Hébergement: Vercel / Netlify / Cloudflare Pages
- [ ] Pages minimales: home, pricing, privacy, terms, auth-callback, download
- [ ] Internationalisation: FR + EN minimum?
- [ ] Documentation utilisateur (Markdown statique vs Mintlify/Docusaurus?)

### Page pricing

- [ ] Mise en avant claire: free vs paid (toujours rappeler que le free reste illimité localement)
- [ ] FAQ: "puis-je continuer offline?", "puis-je annuler?", "où sont mes données?"
- [ ] CTA principal vers le téléchargement, pas vers le checkout direct (signup d'abord)

### Onboarding in-app post-signup

- [ ] Tour guidé (3-5 écrans) à la première connexion compte
- [ ] Proposition d'opt-in sync settings (pas de force, opt-in clair)
- [ ] Message clés API non syncées (transparency dès l'opt-in)
- [ ] Lien vers la doc

> Voir aussi **[06a — Intro tour in-app (post-setup, pré-signup)](./06-onboarding-intro-tour.md)** — brainstorming figé en attente des dépendances 01-auth + 04-billing (crédits offerts) pour pouvoir faire tourner l'étape post-process côté users local-only.

### Proposition de souscription

- [ ] Quand proposer? À l'inscription? Après X jours d'usage? Sur action premium tentée?
- [ ] Pas d'agressivité: un seul rappel par session max
- [ ] "Trial" possible directement dans l'app

### Communication aux users existants

- [ ] Annonce de la v3 dans le changelog in-app
- [ ] Email opt-in si on a leur email (cf. EPIC-08 et politique privacy)
- [ ] Migration: rien ne change par défaut, le compte est opt-in

### Tracking

- [ ] Analytics opt-in (cf. backlog 17.3 — Sentry/Vercel Analytics avec consentement)
- [ ] Conversion funnel
- [ ] Pas de tracking PII sans consentement explicite

### Support utilisateur

- [ ] Email de support (support@…?)
- [ ] FAQ statique
- [ ] Process pour les demandes RGPD (export, delete)
- [ ] SLA implicite (réponse sous 48h?)

### Branding

- [ ] Logo / identité visuelle (existant déjà?)
- [ ] Tonalité (FR friendly? Pro? Geek?)
- [ ] Cohérence app / site / emails

---

## Livrables attendus

1. Site marketing online avec pages essentielles
2. Onboarding in-app post-signup
3. Page pricing publiée
4. Templates emails (welcome, magic link, password reset, factures)
5. FAQ + privacy policy + terms
6. Process RGPD documenté
