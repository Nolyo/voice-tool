# 01 — Auth & comptes

> **Statut**: ✅ Figé le 2026-04-22.
> **Cible**: v3.0 (bloquant).
> **Dépendances**: [`00-threat-model.md`](00-threat-model.md), ADRs 0002-0006.

---

## Principe produit directeur

**Le signup n'est jamais un mur d'entrée.** Voice Tool reste utilisable à 100% en mode local et gratuit, sans compte. Le compte est un **upgrade volontaire** pour celui qui veut synchroniser ses données entre machines ou souscrire au service managé.

Cette posture cadre l'UX auth :
- L'écran login n'est jamais imposé au lancement
- Le compte est proposé via des call-to-action doux ("Sync tes settings", "Essaie le service managé")
- Toutes les features locales restent accessibles sans compte, indéfiniment

---

## Décisions figées (compilation des 13 questions brainstormées)

### Rappels ADRs (déjà actés)

- **ADR 0002** : server-side encryption (style Notion)
- **ADR 0003** : clés API jamais syncées, device-local
- **ADR 0004** : méthodes supportées = Email/password + Magic link + Google OAuth
- **ADR 0005** : flow callback = page web HTTPS + deep link `voice-tool://`
- **ADR 0006** : threat model figé (2FA optionnel, notif nouveau device obligatoire)

### Décisions spécifiques à 01-auth (ADR 0007)

| # | Sujet | Décision |
|---|---|---|
| UX-1 | Hiérarchie boutons login | Magic link en premier (principal), Google OAuth en secondaire, E/P en lien discret |
| UX-2 | Email de confirmation (E/P) | Obligatoire, lien dans email = confirme + logue en 1 clic |
| UX-3 | Durée session | Persistante par défaut, pas de case, logout explicite dans settings |
| UX-4 | Reset password | Flow classique, TTL 15 min, one-time, invalidation sessions actives au changement |
| SEC-5 | Access token TTL | 1h (default Supabase) |
| SEC-6 | Refresh token TTL | 60 jours, rotation rolling (chaque refresh invalide l'ancien) |
| SEC-7 | Magic link TTL | 15 min, one-time, rate limit 3/h/email |
| SEC-8 | Password policy | Min 10 chars, check contre top 10k pwned passwords (liste embarquée), **aucune règle de complexité forcée** (NIST 2017+), **aucune rotation forcée** |
| TEC-9 | Stockage token | Crate Rust `keyring` (Windows Credential Manager / macOS Keychain / Linux libsecret) |
| INFRA-10 | Auth provider | Supabase Auth (plan Pro) |
| INFRA-11 | Domaine callback | `auth.<domaine-final>` (sous-domaine dédié) |
| INFRA-12 | Hébergement callback | Cloudflare Pages |
| SEC-13 | Recovery codes | Générés **uniquement à l'activation du 2FA** (10 codes × 8 chars alphanumériques, one-time, régénérables) |

---

## Flows utilisateur

### Flow 1 — Signup / Login via magic link (méthode principale)

1. User clique "Recevoir un lien de connexion par email" (bouton principal).
2. Tape son email → `POST /auth/magiclink` (Supabase Auth).
3. Réponse **générique** côté UI (anti-enumeration) : *"Si ce compte existe, un lien a été envoyé. Sinon, un compte vient d'être créé avec ce lien."* En pratique Supabase gère signup + login via le même flow.
4. Email envoyé depuis `noreply@<domaine-final>` (SMTP Supabase ou Resend custom) avec lien vers `https://auth.<domaine-final>/callback?token=...&type=magiclink`.
5. Clic du lien (TTL 15 min, one-time) → page callback Cloudflare Pages.
6. Page callback :
   - Lit le token depuis l'URL
   - **Retire le token de l'URL** immédiatement (`history.replaceState`) pour qu'il ne persiste pas dans l'historique navigateur
   - Déclenche le deep link `voice-tool://auth/callback?token=...&type=magiclink`
   - Affiche fallback "Ouvrir Voice Tool" (bouton) + lien téléchargement si l'app n'est pas installée
7. App Tauri reçoit le deep link → échange le token contre une session Supabase (access + refresh).
8. Stocke le refresh token dans le keyring OS via la crate `keyring`.
9. User logué, écran principal affiché.

### Flow 2 — Signup / Login via Google OAuth

1. User clique "Continuer avec Google" (bouton secondaire).
2. Tauri ouvre le navigateur par défaut sur l'URL OAuth Google (via Supabase).
3. User consent → Google redirige vers Supabase → Supabase redirige vers `https://auth.<domaine-final>/callback?code=...&state=...&type=oauth`.
4. Page callback vérifie le `state` parameter (anti-CSRF), extrait le code, déclenche le deep link.
5. À partir de l'étape 6 du Flow 1, le traitement est identique.

**Scopes OAuth demandés** : `openid email profile` — strict minimum.

### Flow 3 — Signup via email/password (option discrète)

1. User clique lien "Utiliser un mot de passe" en dessous des boutons principaux.
2. Formulaire : email + password.
3. **Validation password côté client** :
   - Longueur ≥ 10 chars
   - Pas dans la liste top 10k pwned passwords (embarquée dans le bundle frontend)
   - Jauge de force affichée (indicative, non bloquante)
4. Submit → `POST /auth/signup` (Supabase Auth avec flag `email_confirm` requis).
5. Réponse générique anti-enumeration.
6. Email de confirmation envoyé → lien pointe vers `https://auth.<domaine-final>/callback?token=...&type=signup`.
7. Clic du lien → page callback → deep link → app.
8. App échange le token contre une session (le compte est désormais confirmé **et** logué en 1 action).

### Flow 4 — Login E/P (user existant)

1. User clique "Utiliser un mot de passe", tape email + password.
2. Submit → `POST /auth/login`.
3. Si email pas encore confirmé → message *"Confirme d'abord ton email (on vient de renvoyer le lien si tu l'as perdu)"* + renvoi auto rate-limité.
4. Si 2FA activé → étape supplémentaire (Flow 7).
5. Sinon → session directe, refresh token stocké en keyring.

### Flow 5 — Reset password

1. Lien "Mot de passe oublié ?" sous le champ password.
2. Écran dédié : champ email.
3. Submit → `POST /auth/recover`.
4. Réponse générique anti-enumeration : *"Si un compte existe pour cet email, un lien de réinitialisation vient d'être envoyé."*
5. Email reçu → lien pointe vers `https://auth.<domaine-final>/callback?token=...&type=recovery` (TTL 15 min, one-time).
6. Page callback déclenche deep link avec un type spécial "recovery".
7. App affiche formulaire **"Nouveau mot de passe"** :
   - Validation même politique que signup
   - Submit → `POST /auth/update` avec nouveau password
   - **Toutes les sessions actives (incluant les autres devices) sont invalidées** côté serveur
   - User logué sur le device courant avec une session fraîche
8. Les autres devices se retrouvent délogués au prochain refresh token (rotation rolling).

**Rate limiting** : 3 demandes de reset / heure / email max.

### Flow 6 — Activation 2FA TOTP (depuis les settings)

1. Settings > onglet "Sécurité" > bouton "Activer l'authentification à deux facteurs".
2. Écran 1 : affichage **QR code TOTP** (URI `otpauth://totp/...`) + seed en texte brut (pour apps qui ne scannent pas).
3. User scanne dans son app TOTP (Google Authenticator, Authy, 1Password, Bitwarden, etc.).
4. Écran 2 : user tape le code TOTP courant pour **valider le scan**.
5. Côté serveur : `POST /auth/mfa/enroll` + validation du premier code.
6. Écran 3 : affichage des **10 recovery codes** (8 chars alphanumériques chacun, one-time use).
   - Boutons "Copier tout" et "Télécharger .txt"
   - Checkbox obligatoire **"J'ai sauvegardé mes codes de secours"**
   - Tant que la checkbox n'est pas cochée, le bouton "Terminer" est désactivé
7. Validation finale → flag `mfa_enabled=true` en DB.
8. Settings affichent désormais "2FA activé" + boutons "Régénérer les codes de secours" et "Désactiver 2FA".

**Régénération codes** : invalide les 10 anciens, en génère 10 nouveaux. Nécessite le password + un code TOTP valide.

**Désactivation 2FA** : nécessite le password + un code TOTP valide + confirmation.

### Flow 7 — Login avec 2FA actif

1. L'user termine avec succès un Flow 1/2/4 (magic link, OAuth ou E/P).
2. Avant d'émettre la session finale, Supabase répond avec un JWT **intermédiaire** indiquant `mfa_required=true`.
3. App affiche écran "Entre ton code d'authentification à deux facteurs".
4. User tape un code TOTP **ou** un recovery code (champ unique qui accepte les deux formats).
5. Submit → `POST /auth/mfa/challenge`.
6. Si recovery code utilisé → il est consommé (one-time), flag `recovery_code_used` émis pour notification email.
7. Session finale émise, refresh token stocké en keyring, user logué.

### Flow 8 — Logout

1. Settings > onglet "Compte" > bouton "Se déconnecter".
2. Confirmation modale ("Tes notes synchronisées resteront disponibles en te reconnectant.").
3. Client :
   - Appelle `POST /auth/logout` (Supabase invalide le refresh token côté serveur)
   - Purge le keyring
   - Purge les données synchronisées du cache local (les notes restent en DB cloud, mais pas en local)
4. Retour à l'écran de login. Le mode local reste accessible ("Continuer sans compte").

---

## Session & tokens — résumé des paramètres

| Paramètre | Valeur | Configuration |
|---|---|---|
| Access token TTL | 3600s (1h) | Supabase default |
| Refresh token TTL | 60 jours | Supabase project settings |
| Refresh rotation | Rolling (chaque refresh invalide l'ancien) | Supabase project settings |
| Magic link TTL | 900s (15 min) | Supabase project settings (override default 1h) |
| Reset password TTL | 900s (15 min) | Supabase project settings (override default 1h) |
| Rate limit magic link | 3 / heure / email | Custom via Edge Function ou table `rate_limit_log` |
| Rate limit reset | 3 / heure / email | idem |
| Rate limit login E/P | 5 échecs → blocage 15 min / email | idem |

⚠️ **Rate limiting techno à trancher au démarrage du sprint** : Supabase ne fournit pas out-of-the-box. Options : table `rate_limit_log` en Postgres (simple, pas d'infra supplémentaire) vs Cloudflare en amont (plus scalable). Décision au moment de l'implémentation du sous-épique 02.

---

## Stockage côté Tauri (keyring OS)

### Crate utilisée : `keyring` (Rust)

Wrap natif des 3 OS :
- **Windows** : Credential Manager (DPAPI)
- **macOS** : Keychain Access (l'user approuve l'accès au premier usage, standard)
- **Linux** : Secret Service via libsecret (GNOME Keyring / KWallet)

### Commandes Tauri exposées

```rust
// src-tauri/src/auth.rs (nouveau fichier)
#[tauri::command]
fn store_refresh_token(token: String) -> Result<(), String>

#[tauri::command]
fn get_refresh_token() -> Result<Option<String>, String>

#[tauri::command]
fn clear_refresh_token() -> Result<(), String>
```

### Service + account naming

- Service : `voice-tool-v3`
- Account : `refresh_token` (un seul par install ; si multi-comptes plus tard, accounter par user ID)

### Fallback Linux sans keyring

Distros minimalistes (Alpine, serveurs, live USB) peuvent ne pas avoir `libsecret`. Comportement :
1. Détection au premier login : tentative d'écriture dans keyring.
2. Si échec → message clair : *"Le keyring de votre système n'est pas disponible. Ta session restera active pendant cette utilisation mais tu devras te reconnecter au prochain lancement."*
3. Stockage en mémoire uniquement pour la durée du process.
4. Acceptable en v3.0 (audience desktop grand public, pas serveurs headless).

### Validation avant implémentation

⚠️ Compiler `keyring` avec les deps actuelles (whisper-rs, cpal, tauri-plugin-*) sur Windows en début de sprint, pour confirmer absence de conflit. Cf. feedback projet "vérifier faisabilité avant d'implémenter".

---

## Page web auth-callback

### URL

`https://auth.<domaine-final>/callback`

### Stack

HTML statique + minimal JS vanilla (zéro framework, zéro dépendance runtime).

### Responsabilités

1. Lire `?token=...&type=...` depuis l'URL.
2. **Retirer le token de l'URL** via `history.replaceState` dès réception (pas d'historique navigateur, pas de leak via Referer).
3. Vérifier le `state` parameter pour les retours OAuth (anti-CSRF).
4. Déclencher le deep link `voice-tool://auth/callback?token=...&type=...`.
5. Afficher UI de fallback :
   - Bouton "Ouvrir Voice Tool" (re-trigger le deep link)
   - Lien "Télécharger Voice Tool" (si l'app n'est pas installée)
   - Message d'état clair pendant les 2 secondes où le deep link s'exécute

### CSP stricte

```
Content-Security-Policy:
  default-src 'none';
  script-src 'self';
  style-src 'self';
  img-src 'self' data:;
  connect-src 'self';
  frame-ancestors 'none';
  base-uri 'none';
  form-action 'none';
```

### Autres headers sécu

- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` (HSTS)
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

### Zéro JS tiers

**Aucun** : pas d'analytics (Plausible, Umami, GA), pas de tag manager, pas de chat widget, pas de Sentry. Cette page est exclusivement un passe-plat sécurisé.

---

## Deep link `voice-tool://`

### Enregistrement

Dans `src-tauri/tauri.conf.json` :

```json
{
  "app": {
    "protocols": ["voice-tool"]
  }
}
```

Enregistrement OS :
- **Windows** : clé de registre (gérée par l'installeur NSIS)
- **macOS** : `Info.plist` (gérée par Tauri)
- **Linux** : fichier `.desktop` (gérée par Tauri + installeur deb/rpm)

### Format des URLs

```
voice-tool://auth/callback?token=<JWT>&type=<magiclink|oauth|signup|recovery>&state=<nonce?>
```

- `type` est obligatoire et whitelisté côté app
- `state` présent uniquement pour les retours OAuth (sert à valider anti-CSRF)
- `token` = JWT intermédiaire court (géré par Supabase)

### Validation côté app (Tauri)

Dès réception d'un deep link `voice-tool://auth/callback?...` :

1. **Vérifier que l'app a initié le flow** (pour OAuth) : `state` doit correspondre à un nonce stocké en mémoire lors de l'ouverture du navigateur.
2. **Vérifier le `type`** est dans la whitelist ci-dessus.
3. **Vérifier que le token a un format JWT valide** (header + payload + signature séparés par `.`).
4. **Envoyer le token à Supabase** pour échange contre une session valide.
5. En cas d'échec d'une de ces vérifications : logger l'événement (sans logger le token) et afficher *"Lien invalide ou expiré, merci de réessayer."*.

### Protection anti-replay

- Le `state` nonce est à usage unique, consommé dès la première utilisation.
- Si un deep link arrive avec un `state` déjà consommé ou inconnu : rejet silencieux.

---

## Multi-device

### Liste des devices (v3.0)

- Settings > Compte > section "Devices connectés"
- Affiche : nom OS, type (desktop), dernière activité, ce device *(tag)*
- Bouton "Déconnecter" sur les autres devices → invalide leur refresh token côté Supabase
- Table `user_devices` en DB, alimentée au login (user_agent + OS + dernière IP hachée)

### Email de notification nouveau device

- Déclenché à chaque création d'un nouveau refresh token depuis un device jamais vu
- Contenu : OS, localisation approximative (pays uniquement via géo-IP), date/heure, lien "Ce n'était pas moi" → révoque la session + force reset password
- Anti-abus : si >5 nouveaux devices/24h, blocage du compte + email "activité suspecte détectée, reset password immédiat"

---

## Accessibilité

- Tous les champs labellisés via `<label for>` ou `aria-label`
- Focus automatique sur le premier champ au chargement de l'écran
- Erreurs annoncées au screen reader via `aria-live="assertive"`
- Navigation clavier complète : Tab order logique, Enter = submit, Esc = retour
- Contrastes WCAG AA minimum (déjà couvert par le design system `.vt-app`)
- Pas de dépendance à la couleur seule pour signaler les erreurs

---

## Threats & mitigations (références threat model)

Les surfaces d'attaque P2 du threat model qui touchent ce sous-épique :

| Surface | Mitigations intégrées dans ce design |
|---|---|
| Flow OAuth Google (callback) | `state` parameter obligatoire, redirect URI whitelist côté Google Console, scopes minimaux `openid email profile` |
| Flow Magic Link (email → callback) | TTL 15 min, one-time, anti-enumeration (réponse générique), rate limiting 3/h/email, token nettoyé de l'URL côté page callback |
| Page web auth-callback | CSP stricte, zéro JS tiers, HSTS + preload, `history.replaceState` immédiat, aucun stockage du token côté page |
| Deep link `voice-tool://` | Validation `type` whitelist, validation `state` anti-replay, rejet silencieux des tokens malformés, jamais logger le token |
| API Supabase Auth | RLS strict (voir sous-épique 02 pour les policies sur `user_devices`), rate limiting edge, validation inputs Zod |

Voir [`00-threat-model.md`](00-threat-model.md) pour la liste complète.

---

## Questions techniques remontées au niveau implémentation

Décisions reportées au sprint v3.0, pas au niveau spec :

1. **Rate limiting techno** : table `rate_limit_log` en Postgres vs Cloudflare Workers en amont. À trancher à l'ouverture du sprint.
2. **Fallback Linux sans libsecret** : tester sur au moins 2 distros cibles (Ubuntu, Fedora) en début de sprint.
3. **Validation compilation `keyring`** avec les deps Tauri actuelles sur Windows.
4. **Contenu des email templates** (confirmation, magic link, reset, nouveau device) : copywriting à faire avec i18n (FR + EN) — cf. feedback projet "jamais de texte UI en dur".
5. **Domaine final** : tranché dans le sous-épique 06-onboarding, pas ici.

---

## Livrables dev (découpage PRs prévu, indicatif)

1. **Supabase schema + RLS** — tables `user_devices`, `rate_limit_log`, policies, tests cross-tenant automatisés
2. **Backend Rust** — module `auth.rs` + commandes Tauri : login, logout, refresh silent, gestion keyring, handler deep link, validation state/type
3. **Frontend** — écrans : login (3 méthodes), signup E/P, reset password, 2FA activation, 2FA challenge, settings Compte, settings Sécurité
4. **Page callback** `auth.<domaine-final>` — HTML/CSS/JS minimal + config Cloudflare Pages + `_headers` pour CSP + déploiement CI
5. **Deep link** — enregistrement scheme (`tauri.conf.json`) + handler + tests E2E sur Windows/macOS/Linux
6. **Email templates** — confirmation, magic link, reset password, nouveau device connecté (FR + EN, i18n)
7. **Tests E2E** — flows 1 à 8 via Playwright + Tauri test driver
8. **Documentation utilisateur** — privacy policy, mentions légales (sous-épique 00 must-have GDPR)

---

## Liens

- [EPIC v3](EPIC.md)
- [00 — Threat model](00-threat-model.md)
- [ADR 0002 — Server-side encryption](decisions/0002-server-side-encryption.md)
- [ADR 0003 — Clés API device-local](decisions/0003-api-keys-device-local.md)
- [ADR 0004 — Méthodes d'authentification](decisions/0004-auth-methods.md)
- [ADR 0005 — Flow callback auth](decisions/0005-callback-flow-web-page.md)
- [ADR 0006 — Threat model](decisions/0006-threat-model.md)
- [ADR 0007 — Configuration auth](decisions/0007-auth-configuration.md)
