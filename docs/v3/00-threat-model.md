# 00 — Threat model & sécurité fondations

> **Statut**: 📝 Stub. À brainstormer en premier dans l'ordre d'implémentation.
> **Cible**: v3.0 (bloquant).
> **Dépendances**: EPIC-07 (audit sécurité du code existant) doit être terminé en parallèle ou avant.

---

## Pourquoi ce sous-épique en premier

Toutes les décisions techniques en aval (chiffrement, auth, schéma DB, RLS, gating) sont des **réponses à un threat model**. Sans threat model écrit, on prend des décisions sans savoir contre quoi on se défend, donc on sur-protège ou sous-protège.

Ce document doit cadrer **qui on défend contre quoi** et **ce qu'on accepte explicitement de ne pas couvrir**.

---

## Questions à trancher

### Acteurs (qui peut nous attaquer?)

- [ ] Attaquant externe non-authentifié (script kiddie, scan de masse)
- [ ] Attaquant externe authentifié (a un compte légitime, essaie d'accéder aux données d'un autre)
- [ ] Attaquant ayant compromis un compte tiers (Supabase, Lemon Squeezy, Vercel…)
- [ ] Insider threat: dev solo (toi-même) ou prestataire futur ayant accès au backend
- [ ] Insider Supabase (employé Supabase ayant accès aux DB des clients)
- [ ] État / autorité judiciaire avec subpoena
- [ ] Attaquant ayant compromis le device de l'utilisateur (malware) — **explicitement hors scope**

### Actifs (qu'est-ce qui a de la valeur?)

- [ ] Identité utilisateur (email, password hash)
- [ ] Sessions actives (JWT)
- [ ] Notes texte
- [ ] Métadonnées (last_sync_at, device_count, plan)
- [ ] Données de paiement (gérées par Lemon Squeezy, on ne stocke rien)
- [ ] Clés API utilisateur — **rappel: décision 0003, jamais sur le serveur**

### Surfaces d'attaque

- [ ] API publique Supabase (PostgREST + Edge Functions)
- [ ] Webhook Lemon Squeezy (HMAC déjà en place)
- [ ] Flow OAuth Google (callback handling)
- [ ] Flow magic link (token leak via email forwarding?)
- [ ] Page web auth-callback (XSS, CSRF, redirect open)
- [ ] App desktop Tauri (deep link injection?)
- [ ] Mises à jour de l'app (signature OK, mais updater/server compromis?)

### Compromis acceptés explicitement

À documenter en clair pour que personne (toi inclus dans 6 mois) ne soit surpris.

- [ ] Server-side encryption ⇒ une fuite de la DB Supabase = lecture des notes en clair
- [ ] Pas d'audit log utilisateur en v3.0 (qui a accédé à mes notes?)
- [ ] Pas de chiffrement bout-en-bout en v3.0
- [ ] Device compromis = jeu fini (cohérent avec n'importe quelle app)

### Mesures défensives à confirmer

- [ ] RLS Supabase strict sur toutes les tables (deny by default, policies explicites)
- [ ] Service role key jamais dans le client desktop
- [ ] Rate limiting des Edge Functions
- [ ] Validation stricte des inputs (Zod côté Edge, type checks Rust côté Tauri)
- [ ] Logs serveur sans PII (pas d'email/contenu dans les logs)
- [ ] Rotation des secrets documentée (webhook secret, JWT secret)
- [ ] CSP stricte sur la page web auth-callback
- [ ] Headers sécu (HSTS, X-Frame-Options, etc.) sur le site web
- [ ] Backup chiffré + plan de restauration testé
- [ ] Plan de réponse à incident écrit (qui prévenir, comment notifier les users)
- [ ] 2FA optionnel dès v3.0 (TOTP minimum)

### Conformité

- [ ] GDPR: registre des traitements
- [ ] GDPR: mentions légales / privacy policy publiée avant v3.0
- [ ] GDPR: DPA signé avec Supabase
- [ ] GDPR: DPA signé avec Lemon Squeezy
- [ ] GDPR: droit à l'oubli effectif (delete account purge réellement la DB + les blobs si applicable)
- [ ] GDPR: data export (utilisateur peut télécharger toutes ses données)
- [ ] GDPR: notification de fuite sous 72h documentée

---

## Livrables attendus à la fin de cette session

1. Threat model écrit et figé (ce document, complété)
2. Fichier `SECURITY.md` à la racine du repo (politique de divulgation responsable)
3. Liste des mesures défensives priorisées (must-have v3.0 / nice-to-have v3.x)
4. ADR `0006-threat-model.md` figeant les choix structurants
