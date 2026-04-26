# Bootstrap — Cloudflare Pages auth-callback

## Objectif

Créer un projet Cloudflare Pages vide qui servira la page auth-callback v3, avec CSP stricte configurée via `_headers`.

## Préconditions

- Compte Cloudflare avec 2FA activé (cf. [`accounts-checklist.md`](accounts-checklist.md))
- Repo GitHub `voice-tool` connecté ou un repo dédié `voice-tool-auth-callback` (à créer plus tard dans sous-épique 01)

## Paramètres figés

| Paramètre | Valeur | Source |
|---|---|---|
| Nom projet | `voice-tool-auth-callback` | — |
| Plan | Gratuit | ADR 0007 |
| Source | À définir en sous-épique 01 (repo dédié probablement) | ADR 0007 |
| Domaine custom | `auth.<domaine-final>` | Sous-épique 06 (domaine pas encore acté) |

## Procédure (placeholder — contenu vide)

1. Se connecter à https://dash.cloudflare.com/
2. `Workers & Pages` → `Create` → `Pages` → `Upload assets`
3. Uploader un `index.html` minimal avec contenu "Voice Tool — auth callback placeholder"
4. Déployer — projet accessible sur `voice-tool-auth-callback.pages.dev`
5. Ne pas encore lier de domaine custom (dépend du sous-épique 06)

Le contenu réel (page qui capte le token Supabase et fait le deep link `voice-tool://`) est livré par le sous-épique 01.

## Vérification

- [ ] Projet Cloudflare Pages créé
- [ ] URL `voice-tool-auth-callback.pages.dev` répond avec le placeholder

## Historique d'exécution

| Date | Opérateur | Notes |
|---|---|---|
| <à remplir> | nolyo | Création placeholder |
