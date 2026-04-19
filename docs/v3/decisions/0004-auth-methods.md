# ADR 0004 — Méthodes d'authentification: Email/password + Magic link + Google OAuth

- **Statut**: Accepté
- **Date**: 2026-04-19
- **Contexte de la décision**: session de brainstorming v3

## Contexte

La v3 introduit des comptes utilisateurs. Plusieurs méthodes d'authentification sont possibles, chacune avec ses contraintes Tauri (deep link, callback, etc.):

| Méthode | Avantages | Inconvénients |
|---|---|---|
| Email + password | Universel, pas de dépendance tierce | Password à gérer (oubli, fuite) |
| Magic link | Passwordless, pas de password à voler | Friction (ouvrir mail à chaque login) |
| OAuth Google | 1-clic, pas de password à retenir | Dépendance Google, profilage Google |
| OAuth GitHub | Naturel pour audience tech | Cible niche (devs uniquement) |
| OAuth Apple | Obligatoire si visée App Store Mac | Inutile sur Windows pur |

## Décision

On retient: **Email/password + Magic link + Google OAuth**.

- **Email/password** comme socle universel
- **Magic link** pour les utilisateurs passwordless-first
- **Google OAuth** pour le 1-clic confort

GitHub et Apple sont **écartés** pour la v3.0:
- GitHub: audience trop niche
- Apple: pertinent uniquement quand on visera l'App Store Mac

## Justification

- Position assumée: Voice Tool n'est pas un produit "ultra-privacy revendiqué". Si l'utilisateur veut éviter Google, il a Email/password + Magic link à disposition. S'il préfère le confort Google, le deal est à lui de prendre.
- L'objectif est de **maximiser la conversion sans imposer de provider**.
- Trois méthodes = couverture large sans surcharger la page login (3 boutons, ça reste lisible).

## Conséquences

### Positives
- Couverture confort + universalité + privacy
- Pas de friction "vous devez utiliser Google"
- Pas de dépendance Apple (pas besoin de compte développeur Apple pour l'OAuth)

### Négatives
- 3 flows à implémenter et à maintenir
- 3 cas de gestion compte à traiter (que se passe-t-il si l'user fait E/P puis essaye Magic link sur le même email? Et OAuth Google sur le même email?)
- Quotas Google OAuth (Google Cloud Console) à gérer
- Templates emails (welcome, magic link, password reset) à concevoir

### Mitigations
- Politique de **fusion automatique** des identités sur même email (Supabase Auth gère ça nativement, mais à valider)
- Page login dans l'app: hiérarchie visuelle claire (probablement Magic link en premier, OAuth Google secondaire, E/P en lien "autre option")

## Décisions reportées

- **2FA TOTP**: à trancher dans le sous-épique 01-auth
- **Apple OAuth**: ajouter quand visée App Store Mac confirmée
- **Recovery codes**: à trancher quand 2FA est décidé
- **Limites Supabase Auth**: à modéliser quand on a une estimation MAU
