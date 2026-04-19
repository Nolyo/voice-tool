# 01 — Auth & comptes

> **Statut**: 📝 Stub.
> **Cible**: v3.0.
> **Dépendances**: 00-threat-model figé.

---

## Décisions déjà actées (cf. EPIC.md)

- Méthodes supportées: **Email/password + Magic link + Google OAuth** ([ADR 0004](decisions/0004-auth-methods.md))
- Flow callback: **page web HTTPS** + déclenchement deep link `voice-tool://` ([ADR 0005](decisions/0005-callback-flow-web-page.md))

---

## Questions à trancher

### Provider d'auth

- [ ] Confirmer **Supabase Auth** (incluse dans la stack POC)
- [ ] Limites Supabase Auth gratuit/Pro à modéliser (MAU, OAuth providers)

### Email/password

- [ ] Politique de mot de passe minimum (longueur, complexité, dictionnaire d'interdits?)
- [ ] Hashing (Supabase utilise bcrypt — vérifier le facteur de coût)
- [ ] Rate limiting des tentatives login (Supabase fournit-il assez? Faut-il une couche custom?)
- [ ] Email de confirmation requis avant login? (recommandé: oui)

### Magic link

- [ ] Durée de validité du lien (15min? 1h? réglable?)
- [ ] One-time use (un lien = une seule utilisation, expire après clic)
- [ ] Anti-bruteforce: limiter le nombre de magic link / heure / email

### Google OAuth

- [ ] App Google enregistrée dans Google Cloud Console (OAuth client ID + secret)
- [ ] Scopes minimaux: `openid email profile` — pas plus
- [ ] Domaine de redirect = page web hébergée (déterminer URL prod)

### Session / token

- [ ] Durée de vie access token (Supabase défaut: 1h)
- [ ] Refresh token: durée, rotation, révocation
- [ ] Stockage côté Tauri: keyring OS (Windows Credential Manager / macOS Keychain / Linux Secret Service)
- [ ] Plugin Tauri: `tauri-plugin-keyring` ou alternative à choisir
- [ ] Que se passe-t-il quand l'app est offline? (token expire, on garde la session jusqu'à reconnexion)

### Account recovery

- [ ] Reset password via email (Supabase fournit le flow)
- [ ] **Recovery codes** au signup? (recommandé si 2FA actif)
- [ ] **2FA TOTP** optionnel ou obligatoire dès v3.0?
- [ ] Backup email ou backup phone? (overkill pour v3.0?)

### Multi-device

- [ ] Liste des devices connectés visible dans les settings
- [ ] Possibilité de "déconnecter à distance" un device (révocation refresh token)
- [ ] Notification email à chaque nouveau device connecté

### Deep link `voice-tool://`

- [ ] Enregistrement du scheme dans `tauri.conf.json` (allowlist Windows + macOS + Linux)
- [ ] Format des URLs: `voice-tool://auth/callback?token=...&type=magiclink|oauth`
- [ ] Validation côté app (token signature, expiration, anti-replay)
- [ ] Fallback si scheme pas enregistré: que voit l'utilisateur?

### Page web auth-callback

- [ ] Domaine final (sous-domaine du site marketing? ex: `auth.voice-tool.com`?)
- [ ] Hébergement (Vercel? Netlify? Cloudflare Pages?)
- [ ] CSP stricte
- [ ] Pas de JS tiers (pas d'analytics, pas de tag manager) sur cette page
- [ ] Affichage gracieux si l'utilisateur n'a pas l'app installée: "Téléchargez Voice Tool"

### UX

- [ ] Page login dans l'app: hiérarchie des boutons (Magic link en premier? OAuth en premier?)
- [ ] Mode "rester connecté" vs session expire au quit
- [ ] Détection si déjà connecté (skip écran login au lancement)
- [ ] Logout: vider le keyring + invalider le refresh token côté serveur

### Accessibilité

- [ ] Formulaires labellisés ARIA
- [ ] Focus management (premier champ focus auto)
- [ ] Erreurs annoncées au screen reader

---

## Points de vigilance sécu

- **Token leak via crash log**: ne JAMAIS logger le JWT
- **Token leak via deep link history du navigateur**: utiliser POST + token court ou one-time
- **CSRF sur la page callback web**: vérifier `state` parameter pour OAuth
- **Phishing magic link**: l'email doit clairement venir de notre domaine + pas de lien custom suspect
- **Email enumeration**: la réponse "email envoyé" doit être identique pour un email connu/inconnu

---

## Livrables attendus

1. Spec de design auth complète (formulaires, flow, screens)
2. Choix figés du provider, des plugins Tauri, du domaine callback
3. Plan d'implémentation découpé en PRs
4. ADR additionnels si nécessaire (recovery, 2FA, etc.)
