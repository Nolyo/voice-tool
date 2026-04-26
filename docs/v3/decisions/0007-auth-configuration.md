# ADR 0007 — Configuration auth v3.0

- **Statut**: Accepté
- **Date**: 2026-04-22
- **Contexte de la décision**: session de brainstorming dédiée au sous-épique 01-auth, 13 questions tranchées

## Contexte

Le sous-épique `01-auth` compile 13 décisions techniques détaillées (UX, tokens, politique password, stockage, infra, recovery). Plusieurs de ces décisions ont des conséquences structurantes et doivent être tracées en ADR pour éviter d'être remises en cause sans décision consciente.

Cet ADR fige les **choix de configuration** ; les flows détaillés vivent dans [`../01-auth.md`](../01-auth.md).

## Décisions figées

### Provider & infra

- **Auth provider** : Supabase Auth (plan Pro, ~25$/mois, 100k MAU inclus)
- **Domaine callback** : `auth.<domaine-final>` (sous-domaine dédié pour isolation CSP)
- **Hébergement callback** : Cloudflare Pages (plan gratuit, CSP via `_headers`, zéro tracking par défaut)

### UX / flows

- **Hiérarchie des 3 méthodes** au login : Magic link (bouton principal) > Google OAuth (secondaire) > Email/password (lien discret)
- **Email de confirmation** obligatoire pour les signups E/P (le lien confirme et connecte en 1 action)
- **Session persistante par défaut**, pas de case "Rester connecté"
- **Logout explicite** via bouton dans les settings (purge keyring + invalidation serveur)
- **Reset password** : flow classique Supabase, TTL 15 min, toutes sessions actives invalidées au changement

### Paramètres tokens

| Paramètre | Valeur | Rationale |
|---|---|---|
| Access token TTL | 1h | Default Supabase, sweet spot industrie |
| Refresh token TTL | 60 jours | Rolling rotation, user actif = session infinie, inactif >60j = relog |
| Magic link TTL | 15 min | Durci vs default (1h), one-time |
| Reset password TTL | 15 min | Durci vs default (1h), one-time |
| Rate limit magic link | 3/h/email | Anti-bruteforce |
| Rate limit reset | 3/h/email | Anti-bruteforce |
| Rate limit login E/P | 5 échecs → 15 min blocage/email | Anti-bruteforce |

### Politique password

- **Longueur minimum** : 10 caractères
- **Aucune règle de complexité imposée** (NIST 2017+ : majuscules/chiffres/spéciaux forcés dégradent la sécurité)
- **Check contre top 10k pwned passwords** (liste statique embarquée côté client, pas d'API externe pour éviter le leak)
- **Aucune rotation forcée** (OWASP explicitement contre)

### 2FA

- **TOTP optionnel dès v3.0** (activable dans settings)
- **Recovery codes générés uniquement à l'activation du 2FA** — 10 codes × 8 chars alphanumériques, one-time, régénérables
- Activation nécessite : scan QR + code TOTP valide + checkbox "J'ai sauvegardé mes codes"
- Désactivation nécessite : password + code TOTP valide + confirmation

### Stockage côté Tauri

- **Crate `keyring`** (Rust) pour accès natif OS keyring
  - Windows : Credential Manager
  - macOS : Keychain Access
  - Linux : Secret Service via libsecret
- **Fallback Linux** : message explicite "keyring indisponible, session limitée à cette utilisation" si libsecret absent
- Service name : `voice-tool-v3`

### Multi-device

- **Listing devices** dans settings v3.0 (nom OS, dernière activité, déconnexion à distance)
- **Email notif nouveau device** obligatoire (déjà acté ADR 0006)
- Seuil anti-abus : >5 nouveaux devices/24h = blocage + forçage reset password

## Justification (par groupes)

### Hiérarchie UX : Magic link > OAuth > E/P

Cohérent avec la posture "privacy-conscious" du produit (argument principal = clés API device-local, ADR 0003). Pousser vers passwordless réduit la surface d'attaque "password leak" et raconte une histoire cohérente. Google OAuth reste visible pour ceux qui préfèrent le confort ; E/P disponible pour ceux qui veulent éviter Google sans utiliser magic link.

### TTL 60 jours refresh token

Desktop app avec autostart : re-login tous les 7 jours (default Supabase trop court) = friction inutile pour un produit qu'on utilise potentiellement pas quotidiennement. 60 jours avec rotation rolling détecte un vol de token (user se retrouve délogué dès que l'attaquant utilise le token) sans forcer des relogins pénibles.

### Password policy NIST-style (longueur, pas de complexité)

Recherche NIST SP 800-63B depuis 2017 : les règles "majuscule + chiffre + spécial" **dégradent** la sécurité réelle. Les users créent "Password1!" qui satisfait la règle mais est dans tous les dictionnaires pwned. La longueur fait l'entropie, pas la diversité forcée. Check pwned list bloque les passwords triviaux sans UX pénible.

### Recovery codes uniquement à l'activation 2FA

Sans 2FA activé, les recovery codes n'ont pas de use case (reset password par email suffit). En générer au signup = friction + surface d'attaque gratuite (10 codes valides en DB pour 95% d'users qui n'en auront jamais besoin). Générer à l'activation 2FA = zéro footprint pour les users non-2FA.

### Cloudflare Pages + sous-domaine dédié

Isolation CSP stricte impossible à tenir sur le site marketing principal (qui aura analytics, demo vidéo, etc.). Sous-domaine dédié = CSP ultra-restreinte possible. Cloudflare Pages = plan gratuit généreux, edge worldwide, zéro tracking par défaut (aligné posture privacy).

## Conséquences

### Positives

- Cohérence de la posture sécu/privacy avec le reste du produit
- Paramètres tokens alignés sur les standards modernes (NIST 2024, OWASP 2024)
- Isolation forte de la page callback (CSP stricte possible)
- Effort minimal côté provider (Supabase Auth fournit 80% des flows nativement)
- Vendor lock-in Supabase contenu (déjà acté EPIC.md)

### Négatives / risques acceptés

- **Supabase Auth indisponible = auth cassée.** Pas de fallback multi-provider. Acceptable : Supabase a un SLA, c'est le coût du vendor lock-in conscient.
- **Rate limiting techno non figé** : à trancher au démarrage du sprint (cf. 01-auth.md).
- **Fallback Linux sans libsecret** : session non persistante sur certaines distros minimalistes. Acceptable pour l'audience cible.
- **Email templates** : à customiser (copywriting + i18n FR/EN) — sortir des defaults Supabase avant la release.

### Mitigations

- Tests cross-tenant RLS automatisés (mesure #1 threat model)
- Tests E2E flows 1-8 sur Windows/macOS/Linux
- Validation compilation `keyring` avec deps actuelles en début de sprint
- Rate limiting monitoré via Supabase logs + alerting

## Décisions reportées

- **Domaine final** — sous-épique 06-onboarding
- **Rate limiting implémentation technique** (Postgres table vs Cloudflare) — début sprint 02
- **2FA obligatoire** — v3.x, probablement comptes payants d'abord
- **Apple OAuth** — si visée App Store Mac confirmée
- **Listing devices détaillé** (géolocalisation, historique, etc.) — v3.x si demande user
- **Backup email** / **backup phone** recovery — jugé overkill v3.0

## Processus de révision

Cet ADR est **figé**. Toute révision passe par un nouvel ADR qui supersede celui-ci. Le document [`01-auth.md`](../01-auth.md) est un living document, révisé à chaque clôture de PR ou découverte en implémentation.
