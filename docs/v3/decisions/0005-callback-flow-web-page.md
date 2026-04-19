# ADR 0005 — Flow callback auth: page web + deep link

- **Statut**: Accepté
- **Date**: 2026-04-19
- **Contexte de la décision**: session de brainstorming v3

## Contexte

Magic link et OAuth Google nécessitent un **retour vers l'app desktop** depuis un contexte externe (email, navigateur). Trois approches étaient possibles:

- **A.** Deep link uniquement (`voice-tool://auth/callback?token=...`)
- **B.** Page web HTTPS qui déclenche un deep link
- **C.** Combo (page web pour mails, deep link direct pour OAuth interactif)
- **D.** Page web avec code à copier-coller (pas de deep link)

## Décision

On retient **C — combo: page web HTTPS + deep link `voice-tool://`**.

- Magic link dans les emails pointe vers la **page web HTTPS** du site marketing → la page déclenche le deep link
- OAuth Google retourne via le même mécanisme (Supabase callback URL = page web HTTPS)
- La page web sert de fallback gracieux: si le deep link ne fonctionne pas, l'utilisateur voit un bouton "Ouvrir Voice Tool" et un lien de téléchargement de l'app

## Justification

- **HTTPS jamais bloqué**: les clients mail (Gmail web, Outlook, Apple Mail) ne strippent pas les URLs HTTPS, contrairement aux schemes custom (`voice-tool://`) qui sont parfois filtrés.
- **Le site marketing existe de toute façon** pour la v3 (page premium, pricing, doc): autant l'utiliser comme callback sans surcoût d'hébergement.
- C'est le **standard de l'industrie** (Linear, Notion, 1Password fonctionnent ainsi).
- Fallback gracieux: si l'utilisateur clique le lien sur un device sans Voice Tool installé, il voit une page propre avec lien de téléchargement, pas un message d'erreur cryptique.

## Conséquences

### Positives
- Compatible avec 100% des clients email
- Expérience perçue "produit pro"
- Le site marketing devient utile dès le jour 1
- Centralise tous les flows callback en un endroit (debugging facile)

### Négatives
- Une page web supplémentaire à maintenir
- Latence légèrement supérieure (HTTPS → deep link au lieu de deep link direct)
- Cible CSP / sécurité de la page (XSS sur cette page = leak de tokens)

### Mitigations
- CSP stricte (`default-src 'none'; script-src 'self'`)
- Pas de JavaScript tiers (pas d'analytics, pas de tag manager) sur la page callback
- Token nettoyé de l'URL dès lecture (pas dans l'historique navigateur)
- Tests E2E du flow sur Windows / macOS / Linux pour valider la stabilité du deep link

## Décisions reportées

- **Domaine final** de la page callback (sous-domaine `auth.` ou route du site principal): à trancher dans le sous-épique 06-onboarding quand le domaine site sera figé
- **Hébergement** (Vercel / Netlify / Cloudflare Pages): idem
- **Format exact des URLs deep link**: à trancher dans le sous-épique 01-auth
