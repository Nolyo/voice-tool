# Voice Tool — Epic v3

> Comptes utilisateurs, synchronisation cloud, service managé optionnel.

Ce dossier est l'**epic story** de la v3 de Voice Tool. Il se construit progressivement, sous-épique par sous-épique, au fil des sessions de brainstorming.

## Index

- **[EPIC.md](EPIC.md)** — Document chapeau: contexte, décisions, découpage, phasage. À lire en premier.
- **[00-threat-model.md](00-threat-model.md)** — Modèle de menace (qui on défend contre quoi). À traiter en premier dans l'ordre d'implémentation.
- **[01-auth.md](01-auth.md)** — Auth & comptes (signup, login, OAuth, deep link).
- **[02-sync-settings.md](02-sync-settings.md)** — Sync settings (sans clés API).
- **[03-sync-notes.md](03-sync-notes.md)** — Sync notes texte + migration locale.
- **[04-billing.md](04-billing.md)** — Lemon Squeezy + gating premium (intègre POC `docs/research/lemonsqueezy-poc/`).
- **[05-managed-transcription.md](05-managed-transcription.md)** — Proxy modèles transcription (v3.1+).
- **[06-onboarding.md](06-onboarding.md)** — Marketing, pricing, onboarding UX.
- **[decisions/](decisions/)** — Architecture Decision Records (ADR) au format Michael Nygard.
- **[runbooks/](runbooks/)** — rotations, backups, incidents
- **[compliance/](compliance/)** — registre GDPR, base légale
- **[ops/](ops/)** — bootstrap Supabase, Cloudflare Pages, checklist 2FA

## État d'avancement

| Sous-épique | Statut spec | Statut impl | Cible |
|---|---|---|---|
| 00 — Threat model & fondations | ✅ Figé 2026-04-22 | 🚧 En cours (plan 2026-04-24) | Bloquant v3.0 |
| 01 — Auth | ✅ Figé 2026-04-22 | 📝 À planifier | v3.0 |
| 02 — Sync settings | ✅ Figé 2026-04-22 | 📝 À planifier | v3.0 |
| 03 — Sync notes | 📝 Stub | — | v3.1 |
| 04 — Billing | 📝 Stub (POC fait) | — | v3.2 |
| 05 — Managed transcription | 📝 Stub | — | v3.3 |
| 06 — Onboarding | 📝 Stub | — | v3.1 |

Légende statut spec : 📝 stub, 🚧 en cours, ✅ figé.
Légende statut impl : — non démarré, 📝 à planifier, 🚧 en cours, ✅ livré.

## Convention de travail

- **Une session de brainstorming = un sous-épique.** Pas de mélange.
- **Chaque décision majeure produit un ADR** dans `decisions/`. Pas de décision flottante.
- **EPIC.md reste le résumé navigable** — ne pas l'alourdir avec du détail technique, qui va dans les fichiers sous-épique.
- **Les questions ouvertes restent ouvertes** dans le fichier sous-épique tant qu'elles ne sont pas tranchées. Pas de réponse inventée pour faire propre.
- **Aucune ligne de code applicatif** ne doit être touchée tant qu'un sous-épique n'est pas figé et que son plan d'implémentation n'est pas écrit.
