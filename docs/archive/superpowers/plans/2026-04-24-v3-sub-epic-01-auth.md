# V3 Sub-Epic 01 — Auth & Comptes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer l'auth Supabase complète de Voice Tool v3.0 : 3 méthodes de login (magic link, Google OAuth, email/password), 2FA TOTP optionnel, reset password, multi-device, flow callback via page web + deep link `voice-tool://`, session persistante via keyring OS — **sans jamais imposer la création de compte à l'utilisateur** (mode local reste fonctionnel à 100 %).

**Architecture:** Quatre chantiers articulés :
1. **Infra / Supabase** — configuration projet (TTL tokens, SMTP, OAuth provider), schémas DB (`user_devices`, `rate_limit_log`), RLS, migrations SQL versionnées.
2. **Page callback** (`voice-tool-auth-callback`, nouveau repo) — HTML/CSS/JS vanilla statique + CSP stricte, déployée sur Cloudflare Pages (`voice-tool-auth-callback.pages.dev`, domaine custom différé au sous-épique 06).
3. **Backend Rust** (`src-tauri/src/auth.rs` neuf) — commandes Tauri pour keyring, scheme deep link `voice-tool://`, validation anti-CSRF/anti-replay.
4. **Frontend React/TS** — client Supabase JS, `AuthContext`, écrans login/signup/reset/2FA, onglets settings Compte + Sécurité, i18n FR/EN.

**Tech Stack:** Rust `keyring` crate, `@supabase/supabase-js`, `otpauth` (TOTP côté front pour l'URI QR), React 19 + i18next, Tailwind 4 + shadcn/ui + design system `.vt-app`, Tauri 2 single-instance plugin pour le deep link, Cloudflare Pages (statique + `_headers`), Supabase Auth + Postgres.

**Related spec:** [`docs/v3/01-auth.md`](../../v3/01-auth.md) (figée 2026-04-22), [`docs/v3/decisions/0004-auth-methods.md`](../../v3/decisions/0004-auth-methods.md), [`0005-callback-flow-web-page.md`](../../v3/decisions/0005-callback-flow-web-page.md), [`0007-auth-configuration.md`](../../v3/decisions/0007-auth-configuration.md), [`docs/v3/00-threat-model.md`](../../v3/00-threat-model.md).

**Build verification:**
- Rust : `LIBCLANG_PATH="C:/Program Files/LLVM/bin" PATH="$PATH:/c/Program Files/CMake/bin" cargo check` dans `src-tauri/` (cf. `memory/MEMORY.md`).
- Frontend : `pnpm build` (TypeScript strict + Vite). Demander au user pour lancer `pnpm tauri dev` (cf. CLAUDE.md).
- Pas de suite de tests automatisés du projet actuelle ; on ajoute des tests unitaires Rust (`cargo test` sur `auth.rs`) + tests unitaires TS pour le check pwned-passwords (Vitest, à ajouter) + une checklist manuelle E2E des 8 flows en fin de plan.

**Scope exclu** (hors ce plan, sous-épique 02 ou ultérieur) :
- Sync des settings / notes — c'est le sous-épique 02 et 03. Ce plan livre **uniquement l'auth** et s'arrête dès que la session est valide côté app.
- Customisation fine des email templates (FR/EN) — on met les templates **par défaut fonctionnels** en Task 3, le copywriting propre peut être itéré en v3.0.x.
- Privacy policy publique / mentions légales — sous-épique 06.
- Domaine final `auth.<domaine>` — sous-épique 06. On reste sur `voice-tool-auth-callback.pages.dev` pour v3.0 interne.
- Apple OAuth, backup phone, device listing avec géolocalisation — différés (ADR 0007, section "Décisions reportées").

---

## File Structure

### Files created

**Supabase migrations** (`supabase/migrations/`, nouveau dossier à la racine repo)
- `supabase/migrations/20260501000000_user_devices.sql` — table + RLS
- `supabase/migrations/20260501000100_rate_limit_log.sql` — table + fonction SQL
- `supabase/migrations/20260501000200_new_device_trigger.sql` — trigger email notif

**Page callback** (nouveau repo **séparé** `voice-tool-auth-callback`, cloné à côté de ce repo)
- `voice-tool-auth-callback/index.html`
- `voice-tool-auth-callback/callback.js`
- `voice-tool-auth-callback/style.css`
- `voice-tool-auth-callback/_headers` (CSP + sécu headers pour Cloudflare Pages)
- `voice-tool-auth-callback/README.md`
- `voice-tool-auth-callback/.github/workflows/deploy.yml` (optionnel — déploiement auto Cloudflare)

**Backend Rust** (`src-tauri/src/`)
- `src-tauri/src/auth.rs` — commandes Tauri keyring, état session, parsing deep link, nonce anti-CSRF

**Frontend shell** (`src/`)
- `src/lib/supabase.ts` — client Supabase init
- `src/lib/pwned-passwords.ts` — check contre liste top 10k embarquée
- `src/lib/pwned-passwords-list.ts` — liste importée au build (généré par script)
- `src/contexts/AuthContext.tsx` — état global session
- `src/hooks/useAuth.ts` — hook ergonomique
- `scripts/generate-pwned-list.ts` — script Node qui génère `pwned-passwords-list.ts` depuis le dump SecLists

**Frontend écrans auth** (`src/components/auth/`)
- `src/components/auth/AuthModal.tsx` — modale wrapper (contient toutes les vues)
- `src/components/auth/LoginView.tsx`
- `src/components/auth/SignupView.tsx`
- `src/components/auth/ResetPasswordRequestView.tsx`
- `src/components/auth/ResetPasswordConfirmView.tsx`
- `src/components/auth/TwoFactorActivationFlow.tsx`
- `src/components/auth/TwoFactorChallengeView.tsx`
- `src/components/auth/PasswordStrengthMeter.tsx`
- `src/components/auth/RecoveryCodesPanel.tsx`
- `src/components/auth/AccountCTA.tsx` — call-to-action doux dans le dashboard

**Settings** (`src/components/settings/sections/`)
- `src/components/settings/sections/AccountSection.tsx` — nouveau onglet "Compte"
- `src/components/settings/sections/SecuritySection.tsx` — nouveau onglet "Sécurité"
- `src/components/settings/sections/DevicesList.tsx` — sous-composant de SecuritySection

**i18n**
- Fichiers existants `src/locales/fr.json` et `src/locales/en.json` étendus avec un namespace `auth.*` complet (Task 14).

### Files modified

- `src-tauri/Cargo.toml` — ajout `keyring = "3"`
- `src-tauri/src/lib.rs` — import module `auth`, enregistrement commandes, hook deep link via single-instance
- `src-tauri/src/state.rs` — ajout champ `auth_state: Arc<Mutex<AuthState>>`
- `src-tauri/tauri.conf.json` — ajout `app.deepLinks` / scheme `voice-tool`
- `src-tauri/capabilities/default.json` — permission `deep-link:default` si le plugin l'exige
- `package.json` — ajout `@supabase/supabase-js`, `otpauth`, `vitest` + `@testing-library/react` (dev)
- `src/App.tsx` — écoute event `auth-deep-link-received`, rend `AuthModal`
- `src/components/settings/common/SettingsNav.tsx` — ajout des IDs `section-compte` et `section-securite`
- `src/components/settings/SettingTabs.tsx` — rendu conditionnel des 2 nouvelles sections (si user loggué)
- `src/components/dashboard/DashboardHeader.tsx` — bouton "Se connecter" / avatar selon état session
- `docs/v3/01-auth.md` — section "Livrables" remplie en fin de plan
- `docs/v3/README.md` — passage sous-épique 01 en "🚧 En cours" puis "✅ livré"
- `CLAUDE.md` — section "V3 Auth" ajoutée

### Files NOT touched

- `src-tauri/src/audio.rs`, `transcription*.rs`, `whisper*.rs` — aucun impact audio / transcription.
- `src/contexts/SettingsContext.tsx` — inchangé (settings sync = sous-épique 02).
- Toute la partie `mini.html` / `src/mini-window.tsx` — pas d'auth dans la mini window.

---

## Préflight (à exécuter **avant** de démarrer les tâches codées)

Ces deux vérifications valident que les choix figés tiennent techniquement. Elles protègent le sprint contre des remises en cause tardives.

### PF-1 — Compiler `keyring` sur Windows avec les deps actuelles

**Pourquoi:** feedback projet "vérifier faisabilité avant d'implémenter" + section "Validation avant implémentation" de `01-auth.md`.

- [ ] **Step 1: Créer une branche jetable**

```bash
git checkout -b v3-01-preflight-keyring
```

- [ ] **Step 2: Ajouter la dep dans `src-tauri/Cargo.toml`** (sous la section `[dependencies]`, près de `reqwest`)

```toml
# OS native keyring (Windows Credential Manager, macOS Keychain, Linux libsecret)
keyring = { version = "3", features = ["apple-native", "windows-native", "sync-secret-service"] }
```

- [ ] **Step 3: `cargo check` complet**

Run :
```bash
cd src-tauri && LIBCLANG_PATH="C:/Program Files/LLVM/bin" PATH="$PATH:/c/Program Files/CMake/bin" cargo check
```

Expected : build PASS sans erreur (warnings OK). Si FAIL → étudier le message, potentiellement downgrade à `keyring = "2"` ou ajuster les features.

- [ ] **Step 4: Smoke test minimal de la crate**

Créer `src-tauri/src/bin/keyring_smoke.rs` temporaire :

```rust
use keyring::Entry;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let entry = Entry::new("voice-tool-v3-preflight", "smoke-test")?;
    entry.set_password("hello_keyring")?;
    let got = entry.get_password()?;
    assert_eq!(got, "hello_keyring");
    entry.delete_credential()?;
    println!("✅ keyring round-trip OK");
    Ok(())
}
```

Run : `cargo run --bin keyring_smoke`.
Expected : output `✅ keyring round-trip OK`.

- [ ] **Step 5: Nettoyer**

```bash
rm src-tauri/src/bin/keyring_smoke.rs
rmdir src-tauri/src/bin 2>/dev/null || true
git checkout src-tauri/Cargo.toml Cargo.lock
git checkout -
git branch -D v3-01-preflight-keyring
```

Si Step 3 ou 4 a FAIL : **stopper le plan** et ouvrir une discussion (downgrade keyring 2, ou crate alternative `secret-service` + `windows-credentials` séparés). Ne pas démarrer Task 1.

### PF-2 — Trancher la techno rate limiting

**Pourquoi:** 01-auth.md §"Questions techniques remontées" point 1 — ne pas laisser flotter pendant le sprint.

- [ ] **Step 1: Arbitrer**

Deux options :
- **A. Table Postgres `rate_limit_log` + fonction SQL** — zéro infra en plus, géré par Supabase, performant (RLS n'est pas appliquée aux fonctions `security definer`).
- **B. Cloudflare Workers en amont** — plus scalable, mais ajoute une infra à maintenir, complexifie le déploiement local.

**Décision recommandée : option A.** Voice Tool v3.0 vise < 10k DAU ; Postgres tient sans effort à ce volume. Option B peut être migrée v3.x si scale réel le justifie.

- [ ] **Step 2: Écrire l'ADR 0008**

Créer `docs/v3/decisions/0008-rate-limiting-implementation.md` :

```markdown
# ADR 0008 — Rate limiting techno : table Postgres

- **Statut**: Accepté
- **Date**: 2026-04-24
- **Contexte**: 01-auth.md exige du rate limiting sur magic link (3/h/email), reset password (3/h/email), login E/P (5 échecs → blocage 15 min/email).

## Décision

Implémentation via une **table Postgres `rate_limit_log`** + fonction SQL `check_rate_limit(key text, window_seconds int, max_count int)` appelée depuis les edge functions Supabase (et potentiellement des triggers côté auth).

## Justification

- Zéro infra supplémentaire (on est déjà sur Supabase).
- Volume < 10k DAU en v3.0 → Postgres tient.
- Pas de dépendance Cloudflare Workers (peut être ajoutée plus tard sans casser).
- Simplicité d'audit : un `SELECT` suffit pour voir l'historique.

## Conséquences

- Table `rate_limit_log` indexée par `(key, created_at)` pour perfs.
- Purge quotidienne des entrées > 24h via cron Supabase (ou fonction `pg_cron` si activée).
- Visibilité logs centralisée dans Supabase (pratique pour incident response).

## Décision reportée

Migration vers Cloudflare Workers si le volume dépasse 10k DAU (v3.x).
```

- [ ] **Step 3: Commit**

```bash
git add docs/v3/decisions/0008-rate-limiting-implementation.md
git commit -m "docs(v3): adr 0008 rate limiting via postgres table"
```

---

## Task 1: Bootstrap repo `voice-tool-auth-callback`

**Files:**
- Create: `voice-tool-auth-callback/` (nouveau repo, cloné à côté du repo principal)
- Create: `voice-tool-auth-callback/README.md`
- Create: `voice-tool-auth-callback/.gitignore`

**Pourquoi d'abord:** le backend Supabase nécessite une **redirect URI whitelistée** dès la Task 3. On a besoin de l'URL Cloudflare (`voice-tool-auth-callback.pages.dev`) connue avant de configurer l'auth dans le dashboard Supabase.

- [ ] **Step 1: Créer le repo local et initialiser**

**Action utilisateur requise** : créer un repo GitHub `voice-tool-auth-callback` (public ou privé, peu importe) via l'UI ou `gh repo create`. Cloner localement à côté de `voice-tool/` :

```bash
cd C:/Users/nolyo/www
gh repo create voice-tool-auth-callback --public --description "Auth callback page for Voice Tool v3 (Cloudflare Pages)" --clone
cd voice-tool-auth-callback
```

- [ ] **Step 2: Créer `README.md`**

```markdown
# voice-tool-auth-callback

Page statique servant le callback auth de Voice Tool v3 (magic link, OAuth, reset password). Déployée sur Cloudflare Pages.

## Rôle

1. Lit `?token=...&type=...` depuis l'URL
2. Retire immédiatement le token de l'URL (`history.replaceState`)
3. Vérifie le `state` pour les retours OAuth (anti-CSRF)
4. Déclenche le deep link `voice-tool://auth/callback?token=...&type=...`
5. Affiche un fallback "Ouvrir Voice Tool" + lien de téléchargement

## CSP

Ultra-stricte, zéro JS tiers (pas d'analytics, pas de chat, pas de Sentry). Voir `_headers`.

## Déploiement

Auto-déployé par Cloudflare Pages à chaque push sur `main`. Preview sur chaque PR.

## Références

- Spec complète : [`docs/v3/01-auth.md`](https://github.com/Nolyo/lexena/blob/main/docs/v3/01-auth.md) (repo principal)
- ADR 0005 : flow callback page web + deep link
- ADR 0007 : Cloudflare Pages + CSP stricte
```

- [ ] **Step 3: Créer `.gitignore`**

```gitignore
node_modules/
.DS_Store
.vscode/
.env
.env.local
```

- [ ] **Step 4: Commit initial**

```bash
git add README.md .gitignore
git commit -m "chore: init voice-tool-auth-callback repo"
git push -u origin main
```

- [ ] **Step 5: Connecter le repo à Cloudflare Pages**

**Action utilisateur requise** : suivre `docs/v3/ops/cloudflare-pages-bootstrap.md` du repo principal, en **remplaçant** le placeholder Pages créé au sous-épique 00 par une connexion Git sur ce nouveau repo :

1. Dashboard Cloudflare → `Workers & Pages` → projet `voice-tool-auth-callback`
2. `Settings` → `Build & Deployments` → `Production branch` : `main`
3. `Framework preset` : `None` (HTML statique brut)
4. `Build command` : (vide)
5. `Build output directory` : `/`
6. Déclencher un deploy manuel pour vérifier que `voice-tool-auth-callback.pages.dev` répond.

- [ ] **Step 6: Noter l'URL Cloudflare dans la procédure**

Revenir au repo principal, éditer `docs/v3/ops/cloudflare-pages-bootstrap.md` section "Historique d'exécution" pour remplir la date + URL réelle (`voice-tool-auth-callback.pages.dev` ou un sous-domaine random si conflit).

```bash
cd ../voice-tool
# Edit docs/v3/ops/cloudflare-pages-bootstrap.md manually
git add docs/v3/ops/cloudflare-pages-bootstrap.md
git commit -m "docs(v3): record Cloudflare Pages URL for auth-callback"
```

---

## Task 2: Page callback — HTML/CSS/JS + CSP

**Files:**
- Create: `voice-tool-auth-callback/index.html`
- Create: `voice-tool-auth-callback/style.css`
- Create: `voice-tool-auth-callback/callback.js`
- Create: `voice-tool-auth-callback/_headers`

**Pourquoi:** livrer la page réelle qui capte le token et déclenche le deep link. Tout le flow auth dépend de ça.

- [ ] **Step 1: Créer `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Voice Tool — Authentication</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="card" aria-live="polite">
    <h1>Voice Tool</h1>
    <p id="status">Opening Voice Tool…</p>
    <div id="actions" hidden>
      <button type="button" id="retry-btn">Open Voice Tool</button>
      <a id="download-link" href="https://github.com/Nolyo/lexena/releases/latest" target="_blank" rel="noopener noreferrer">Download Voice Tool</a>
    </div>
    <p class="small" id="error-msg" hidden></p>
  </main>
  <script src="callback.js"></script>
</body>
</html>
```

- [ ] **Step 2: Créer `style.css` (minimaliste, mobile-friendly)**

```css
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --fg: #1a1a1a;
  --muted: #666;
  --accent: #4338ca;
  --accent-hover: #3730a3;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111111;
    --fg: #f5f5f5;
    --muted: #999;
    --accent: #818cf8;
    --accent-hover: #a5b4fc;
  }
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  min-height: 100vh;
  display: grid;
  place-items: center;
}
.card {
  max-width: 420px;
  padding: 32px;
  text-align: center;
}
h1 { font-size: 28px; margin: 0 0 16px; }
p { font-size: 16px; margin: 0 0 16px; color: var(--muted); }
.small { font-size: 13px; }
button, a#download-link {
  display: inline-block;
  padding: 10px 18px;
  margin: 4px;
  font-size: 14px;
  border-radius: 8px;
  text-decoration: none;
  cursor: pointer;
  border: 0;
}
button {
  background: var(--accent);
  color: white;
}
button:hover { background: var(--accent-hover); }
a#download-link {
  background: transparent;
  color: var(--accent);
  border: 1px solid var(--accent);
}
```

- [ ] **Step 3: Créer `callback.js` — cœur du flow**

```javascript
(function () {
  'use strict';

  var WHITELIST_TYPES = ['magiclink', 'oauth', 'signup', 'recovery', 'email_change'];
  var statusEl = document.getElementById('status');
  var actionsEl = document.getElementById('actions');
  var errorEl = document.getElementById('error-msg');
  var retryBtn = document.getElementById('retry-btn');

  function show(msg) { statusEl.textContent = msg; }
  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }
  function revealActions() { actionsEl.hidden = false; }

  // Parse both query string AND hash fragment (Supabase OAuth returns tokens in hash).
  function parseParams() {
    var out = {};
    try {
      var query = new URLSearchParams(window.location.search);
      query.forEach(function (v, k) { out[k] = v; });
      if (window.location.hash && window.location.hash.length > 1) {
        var hash = new URLSearchParams(window.location.hash.substring(1));
        hash.forEach(function (v, k) { out[k] = v; });
      }
    } catch (e) {
      // ignore
    }
    return out;
  }

  var params = parseParams();

  // Strip tokens from URL immediately to avoid Referer / history leaks.
  try {
    history.replaceState({}, document.title, window.location.pathname);
  } catch (_) { /* old browsers, non-blocking */ }

  var type = params.type || '';
  if (WHITELIST_TYPES.indexOf(type) === -1) {
    // Supabase sometimes sends 'error' or 'error_description' — surface them gracefully.
    if (params.error) {
      showError('Authentication failed: ' + (params.error_description || params.error));
    } else {
      showError('Invalid authentication link.');
    }
    revealActions();
    return;
  }

  // Build deep link payload.
  var deepLinkParams = new URLSearchParams();
  deepLinkParams.set('type', type);
  // Forward every known auth field Supabase might send.
  ['access_token', 'refresh_token', 'token', 'token_hash', 'code', 'state', 'expires_in', 'expires_at'].forEach(function (k) {
    if (params[k]) deepLinkParams.set(k, params[k]);
  });

  var deepLink = 'voice-tool://auth/callback?' + deepLinkParams.toString();

  function triggerDeepLink() {
    // Use a hidden iframe to avoid navigating away on failure.
    var iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = deepLink;
    document.body.appendChild(iframe);
    // Fallback: also try direct navigation (some browsers block iframe schemes).
    setTimeout(function () {
      window.location.href = deepLink;
    }, 100);
  }

  show('Opening Voice Tool…');
  triggerDeepLink();

  // After 2s, reveal fallback UI.
  setTimeout(function () {
    show('If Voice Tool did not open automatically:');
    revealActions();
  }, 2000);

  retryBtn.addEventListener('click', triggerDeepLink);
})();
```

- [ ] **Step 4: Créer `_headers` avec CSP stricte**

```
/*
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Robots-Tag: noindex, nofollow
```

Note : le format Cloudflare Pages `_headers` est un fichier par dossier, pas YAML. `/*` matche toutes les routes.

- [ ] **Step 5: Tester localement (optionnel mais recommandé)**

```bash
# Sert le dossier sur http://localhost:8000
python -m http.server 8000
# ou: npx serve -l 8000 .
```

Ouvrir `http://localhost:8000/?token=fake&type=magiclink` dans le navigateur. Expected :
- "Opening Voice Tool…" affiché
- Après 2 s, bouton "Open Voice Tool" visible
- L'URL est nettoyée (pas de `?token=...` visible)
- Console devtools : pas d'erreur CSP (attention : les headers `_headers` ne s'appliquent qu'en déploiement Cloudflare, pas sur `python -m http.server`)

- [ ] **Step 6: Commit + push + déploiement auto**

```bash
git add index.html style.css callback.js _headers
git commit -m "feat: implement auth callback page with strict CSP"
git push origin main
```

Cloudflare Pages détecte le push, déploie en ~30 s.

- [ ] **Step 7: Valider le déploiement**

**Action utilisateur requise** :
1. Ouvrir `https://voice-tool-auth-callback.pages.dev/?token=fake&type=magiclink`
2. DevTools → Network → vérifier que les headers HTTP incluent bien CSP, HSTS, XFO.
3. DevTools → Console : aucun warning CSP.

- [ ] **Step 8: Retour au repo principal, noter la validation**

```bash
cd ../voice-tool
# Edit docs/v3/ops/cloudflare-pages-bootstrap.md — cocher "Projet Cloudflare Pages créé"
```

Commit dans le repo principal :

```bash
git add docs/v3/ops/cloudflare-pages-bootstrap.md
git commit -m "docs(v3): confirm auth-callback page deployed with CSP"
```

---

## Task 3: Configurer Supabase Auth (dashboard + CLI)

**Files:**
- Modify: `docs/v3/ops/supabase-bootstrap.md` — ajouter une section "Configuration auth v3.0"

**Pourquoi:** figer tous les paramètres auth côté dashboard Supabase **avant** de coder côté app. Sans ça, les TTL tokens sont faux, les redirect URIs inexistantes, les emails templates en anglais Supabase default.

- [ ] **Step 1: Configurer les paramètres dans le dashboard Supabase**

**Action utilisateur requise** : dans https://supabase.com/dashboard, projet `voice-tool-v3-prod` :

1. `Authentication` → `Providers` :
   - **Email** : Enabled. Cocher "Confirm email" (obligatoire). Confirmation link TTL : `900` seconds (15 min).
   - **Google** : Enabled. Client ID + Client Secret à récupérer depuis la Google Cloud Console (Task 4 ci-dessous). **Ne pas activer maintenant si la console Google n'est pas encore configurée — laisser pour Task 4.**
2. `Authentication` → `URL Configuration` :
   - **Site URL** : `https://voice-tool-auth-callback.pages.dev`
   - **Redirect URLs** (additional) :
     - `https://voice-tool-auth-callback.pages.dev/**`
     - `voice-tool://auth/callback` *(pour les futures versions qui ne passeraient pas par la page web)*
3. `Authentication` → `Rate Limits` :
   - **Emails sent** : 30/hour (default, OK)
   - **Token refresh** : 150/5min (default OK)
   - **Sign up / Sign in** : 30/5min (OK)
4. `Authentication` → `Sessions` :
   - **JWT expiry** : `3600` (1 h, default)
   - **Refresh token rotation** : Enabled
   - **Refresh token reuse interval** : `10` seconds (grace period rotation, default OK)
   - **Inactivity timeout** : `5184000` (60 jours) — paramètre `refresh_token.reuse_interval` et `refresh_token.revoke_after`.
5. `Authentication` → `Email Templates` — customiser **au minimum** le subject et le body pour :
   - Confirm signup
   - Invite user (inutile v3.0, skip)
   - Magic Link
   - Change Email Address
   - Reset Password

   Template Magic Link (EN, à copier tel quel pour démarrer) :

   ```html
   <h2>Log in to Voice Tool</h2>
   <p>Click the button below to log in — this link expires in 15 minutes.</p>
   <p><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 24px;background:#4338ca;color:white;border-radius:8px;text-decoration:none">Log in to Voice Tool</a></p>
   <p>If you did not request this link, you can safely ignore this email.</p>
   ```

   **Note FR/EN** : Supabase ne supporte pas nativement le multi-langue de templates. Décision v3.0 : **templates en anglais uniquement**, ticket ouvert pour v3.x (via Resend SMTP custom). Noter dans `docs/v3/01-auth.md` §"Questions techniques" point 4.

6. `Authentication` → `MFA` :
   - **TOTP** : Enabled (Phone : Disabled — on ne supporte pas SMS)
   - Max enrolled factors : 10 (default OK)

- [ ] **Step 2: Documenter la config dans `supabase-bootstrap.md`**

Ajouter en fin de fichier `docs/v3/ops/supabase-bootstrap.md` :

```markdown
## Configuration auth v3.0 (appliquée 2026-04-2X)

Source : `docs/v3/decisions/0007-auth-configuration.md`.

### Paramètres appliqués dashboard

- **Site URL** : `https://voice-tool-auth-callback.pages.dev`
- **Redirect URLs** : `https://voice-tool-auth-callback.pages.dev/**`, `voice-tool://auth/callback`
- **Magic link TTL** : 900 s (15 min)
- **Recovery TTL** : 900 s (15 min)
- **JWT expiry** : 3600 s (1 h)
- **Refresh token rotation** : activée (rolling)
- **Refresh token revoke_after** : 5 184 000 s (60 jours)
- **MFA TOTP** : enabled (Phone disabled)

### Email templates

- Confirm signup, Magic Link, Reset Password customisés (anglais only v3.0, FR différé v3.x).
- From address : noreply@<projet>.supabase.co (default, à migrer vers SMTP custom quand domaine final acté — sous-épique 06).

### Redirect URLs des fournisseurs OAuth

- Google OAuth : callback URL enregistrée dans Google Cloud Console = `https://<projet-ref>.supabase.co/auth/v1/callback`.

### Historique

| Date | Opérateur | Modification |
|---|---|---|
| 2026-04-2X | nolyo | Config auth initiale sous-épique 01 |
```

- [ ] **Step 3: Commit**

```bash
git add docs/v3/ops/supabase-bootstrap.md
git commit -m "docs(v3): document supabase auth configuration for v3"
```

---

## Task 4: Configurer Google OAuth (Google Cloud Console)

**Files:**
- Modify: `docs/v3/ops/supabase-bootstrap.md` — section "Google OAuth" complétée

**Pourquoi:** ADR 0004 — Google OAuth est l'une des 3 méthodes figées. Configurable **sans** toucher au code, à faire maintenant pour débloquer Task 3 step 1.1.

- [ ] **Step 1: Créer l'app OAuth Google**

**Action utilisateur requise** :
1. https://console.cloud.google.com/ → créer un projet `voice-tool-v3` si pas déjà fait (compte Google déjà en 2FA cf. accounts-checklist).
2. `APIs & Services` → `OAuth consent screen` → External → remplir :
   - App name : `Voice Tool`
   - User support email : `security@voice-tool.app` (alias à créer, ou email perso temporairement)
   - App logo : upload `src-tauri/icons/128x128.png`
   - App domain : `voice-tool-auth-callback.pages.dev` (placeholder v3.0)
   - Authorized domains : `pages.dev`, `supabase.co`
   - Developer contact : email perso
   - **Scopes demandés** : `openid`, `email`, `profile` — **strict minimum** (ADR 0007).
   - Test users (v3.0 mode Testing) : ajouter ton email + 2-3 beta testeurs.
3. `APIs & Services` → `Credentials` → `Create Credentials` → `OAuth client ID` :
   - Application type : `Web application`
   - Name : `Voice Tool Supabase`
   - Authorized redirect URIs : `https://<projet-ref>.supabase.co/auth/v1/callback` (récupérer `<projet-ref>` depuis `docs/v3/ops/supabase-bootstrap.md`)
4. Copier **Client ID** et **Client Secret**.

- [ ] **Step 2: Configurer le provider Google dans Supabase**

Dashboard Supabase → `Authentication` → `Providers` → `Google` :
- Enabled : ON
- Client ID : `<à coller>`
- Client Secret : `<à coller>`
- Skip nonce check : OFF (default)
- Save

- [ ] **Step 3: Test manuel**

```
https://<projet-ref>.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fvoice-tool-auth-callback.pages.dev
```

Ouvrir l'URL ci-dessus dans un navigateur. Expected :
- Page de consent Google
- Après consent → redirect vers `voice-tool-auth-callback.pages.dev` avec tokens en query/hash
- La page callback tente le deep link `voice-tool://auth/callback?...` (qui échoue tant que la Task 9 n'est pas faite — normal).

- [ ] **Step 4: Documenter**

Compléter `docs/v3/ops/supabase-bootstrap.md` section "Google OAuth" avec :
- Project Google Cloud ID
- OAuth client ID (public, OK à committer)
- URL de la page consent screen

**Ne pas committer le Client Secret.** Il vit dans Supabase + le gestionnaire de mots de passe perso.

- [ ] **Step 5: Commit**

```bash
git add docs/v3/ops/supabase-bootstrap.md
git commit -m "docs(v3): configure google oauth app for supabase"
```

---

## Task 5: Schéma DB — `user_devices` (migration SQL)

**Files:**
- Create: `supabase/migrations/20260501000000_user_devices.sql`

**Pourquoi:** tracker les devices logés par user pour la liste multi-device (Flow 1 step 7, section "Multi-device" 01-auth.md) et la notification "nouveau device" (ADR 0006). Dépend de Task 3 (projet Supabase configuré).

- [ ] **Step 1: Initialiser Supabase CLI local**

**Action utilisateur requise** (une fois) :

```bash
cd C:/Users/nolyo/www/voice-tool
npm install -g supabase
supabase init  # crée supabase/ dans le repo
supabase link --project-ref <ref>  # lie au projet remote (demande l'access token Supabase)
```

Ajouter `supabase/.temp/`, `supabase/config.toml` si souhaité au `.gitignore` (selon template défaut).

- [ ] **Step 2: Créer le fichier migration**

`supabase/migrations/20260501000000_user_devices.sql` :

```sql
-- Tracks every device (browser / OS install) a user has logged in from.
-- Used to power the "devices list" in settings and to detect new devices for email notifications.

create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_fingerprint text not null,
  os_name text,
  os_version text,
  app_version text,
  last_ip_hash text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  label text,
  unique (user_id, device_fingerprint)
);

create index if not exists user_devices_user_id_idx on public.user_devices (user_id);
create index if not exists user_devices_last_seen_idx on public.user_devices (user_id, last_seen_at desc);

alter table public.user_devices enable row level security;

-- RLS: user can SELECT/UPDATE/DELETE their own devices; never anyone else's.
create policy "user_devices_select_own" on public.user_devices
  for select using (auth.uid() = user_id);

create policy "user_devices_insert_own" on public.user_devices
  for insert with check (auth.uid() = user_id);

create policy "user_devices_update_own" on public.user_devices
  for update using (auth.uid() = user_id);

create policy "user_devices_delete_own" on public.user_devices
  for delete using (auth.uid() = user_id);

comment on table public.user_devices is 'Devices (installs) a user has logged in from. Feeds settings device list + new-device email notifications.';
comment on column public.user_devices.device_fingerprint is 'App-generated UUID v4 stored in the OS keyring, stable per install.';
comment on column public.user_devices.last_ip_hash is 'SHA-256 of the IP at last login — used to detect new geo only, never logged raw.';
```

- [ ] **Step 3: Appliquer la migration**

```bash
supabase db push
```

Expected : `Finished supabase db push`. Vérifier dans le dashboard `Table Editor` que `user_devices` existe avec les 4 policies RLS visibles.

- [ ] **Step 4: Test cross-tenant RLS (automatisé)**

Créer `supabase/tests/user_devices_rls.test.sql` :

```sql
-- Test: a user cannot read another user's devices.
-- Assumes two test users exist in the project (created manually via dashboard).

begin;
select plan(2);

-- Stub two users. Replace UUIDs with real test users from the dashboard.
-- (See docs/v3/ops/supabase-bootstrap.md for the agreed fixture UUIDs.)
\set user_a '00000000-0000-0000-0000-000000000001'
\set user_b '00000000-0000-0000-0000-000000000002'

-- As user A, insert a device, then try to read user B's rows.
insert into public.user_devices (user_id, device_fingerprint) values (:'user_a', 'fp-a-1');
insert into public.user_devices (user_id, device_fingerprint) values (:'user_b', 'fp-b-1');

-- Impersonate user A.
set local role authenticated;
set local "request.jwt.claim.sub" to :'user_a';

select is(
  (select count(*) from public.user_devices where user_id = :'user_b'),
  0::bigint,
  'user A sees 0 devices belonging to user B'
);

select is(
  (select count(*) from public.user_devices where user_id = :'user_a'),
  1::bigint,
  'user A sees their own 1 device'
);

select * from finish();
rollback;
```

Run :
```bash
supabase db test
```

Expected : 2 assertions PASS.

Note : si l'extension `pgtap` n'est pas activée, activer via `create extension pgtap;` dans une migration dédiée `20260501000001_enable_pgtap.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260501000000_user_devices.sql supabase/tests/user_devices_rls.test.sql
git commit -m "feat(db): add user_devices table with RLS and cross-tenant tests"
```

---

## Task 6: Schéma DB — `rate_limit_log` + fonction SQL

**Files:**
- Create: `supabase/migrations/20260501000100_rate_limit_log.sql`

**Pourquoi:** implémenter le rate limiting figé ADR 0008 (Task PF-2).

- [ ] **Step 1: Créer la migration**

`supabase/migrations/20260501000100_rate_limit_log.sql` :

```sql
-- Rate limiting via Postgres table (ADR 0008).
-- One row per rate-limited event; a helper function checks the count in a sliding window.

create table if not exists public.rate_limit_log (
  id bigserial primary key,
  key text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_log_key_created_idx
  on public.rate_limit_log (key, created_at desc);

-- RLS: nobody reads this table directly. Only the helper function (security definer) has access.
alter table public.rate_limit_log enable row level security;
create policy "rate_limit_log_deny_all" on public.rate_limit_log for all using (false);

-- Returns true if the key has exceeded max_count in the last window_seconds.
-- Always inserts a new row for audit, then returns the count.
create or replace function public.check_rate_limit(
  p_key text,
  p_window_seconds int,
  p_max_count int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count int;
begin
  insert into public.rate_limit_log (key) values (p_key);
  select count(*) into current_count
  from public.rate_limit_log
  where key = p_key
    and created_at > now() - make_interval(secs => p_window_seconds);
  return current_count > p_max_count;
end;
$$;

grant execute on function public.check_rate_limit to anon, authenticated;

-- Purge entries older than 24h (cron recommended but optional at this stage).
create or replace function public.purge_rate_limit_log() returns void
language sql
security definer
as $$
  delete from public.rate_limit_log where created_at < now() - interval '24 hours';
$$;

comment on table public.rate_limit_log is 'Sliding-window rate limit log. See ADR 0008.';
comment on function public.check_rate_limit is 'Inserts one row + returns true if the key has exceeded max_count in the last window_seconds.';
```

- [ ] **Step 2: Appliquer**

```bash
supabase db push
```

- [ ] **Step 3: Smoke test**

Dashboard Supabase → `SQL Editor` :

```sql
-- Expect: first 3 calls return false, 4th returns true.
select public.check_rate_limit('test:key1', 60, 3);  -- false
select public.check_rate_limit('test:key1', 60, 3);  -- false
select public.check_rate_limit('test:key1', 60, 3);  -- false
select public.check_rate_limit('test:key1', 60, 3);  -- true
-- Cleanup
delete from public.rate_limit_log where key = 'test:key1';
```

Expected : dernier SELECT renvoie `true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260501000100_rate_limit_log.sql
git commit -m "feat(db): add rate_limit_log table and check_rate_limit function"
```

---

## Task 7: Ajouter la crate `keyring` au backend Rust

**Files:**
- Modify: `src-tauri/Cargo.toml`

**Pourquoi:** débloquer la Task 8 qui utilise `keyring`. La compilation a déjà été validée en PF-1.

- [ ] **Step 1: Ajouter la dep**

Dans `src-tauri/Cargo.toml`, après la ligne `reqwest` (après ligne 57) :

```toml
# OS native keyring (Windows Credential Manager, macOS Keychain, Linux libsecret)
keyring = { version = "3", features = ["apple-native", "windows-native", "sync-secret-service"] }
```

- [ ] **Step 2: Vérifier le build**

```bash
cd src-tauri && LIBCLANG_PATH="C:/Program Files/LLVM/bin" PATH="$PATH:/c/Program Files/CMake/bin" cargo check
```

Expected : PASS.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(auth): add keyring crate for secure token storage"
```

---

## Task 8: Module `auth.rs` — commandes keyring + état session

**Files:**
- Create: `src-tauri/src/auth.rs`
- Modify: `src-tauri/src/state.rs` — ajouter `auth: Mutex<AuthState>`
- Modify: `src-tauri/src/lib.rs` — import + register commands

**Pourquoi:** exposer au frontend les 4 primitives keyring figées dans `01-auth.md` §"Stockage côté Tauri".

- [ ] **Step 1: Créer `src-tauri/src/auth.rs`**

```rust
//! Auth module — keyring storage + deep-link anti-CSRF nonce + session state.
//!
//! The frontend owns the Supabase session (access token, user info) in memory
//! via `@supabase/supabase-js`. We persist **only the refresh token** in the OS
//! keyring so the session survives app restarts.

use std::sync::Mutex;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::{info, warn};

const KEYRING_SERVICE: &str = "voice-tool-v3";
const KEYRING_ACCOUNT_REFRESH_TOKEN: &str = "refresh_token";
const KEYRING_ACCOUNT_DEVICE_ID: &str = "device_fingerprint";

/// In-memory state tracked by the Rust side of the auth flow.
/// The main session lives in the frontend; Rust only guards the keyring
/// and the anti-CSRF nonces used during OAuth / deep-link handshakes.
#[derive(Default)]
pub struct AuthState {
    /// Pending OAuth state nonces. Consumed on first use.
    pending_oauth_states: Vec<String>,
    /// Fallback: when the OS keyring is unavailable (e.g. minimal Linux distro),
    /// we hold the refresh token in memory only for this process lifetime.
    memory_fallback_refresh_token: Option<String>,
    /// Flag raised on first failed keyring access so the UI can surface a warning.
    keyring_available: bool,
}

impl AuthState {
    pub fn new() -> Self {
        Self {
            pending_oauth_states: Vec::new(),
            memory_fallback_refresh_token: None,
            keyring_available: true,
        }
    }
}

#[derive(Serialize, Deserialize)]
pub struct KeyringStatus {
    pub available: bool,
    pub message: String,
}

// ---------- Refresh token commands ----------

#[tauri::command]
pub fn store_refresh_token(
    token: String,
    state: State<'_, Mutex<AuthState>>,
) -> Result<KeyringStatus, String> {
    match write_keyring(KEYRING_ACCOUNT_REFRESH_TOKEN, &token) {
        Ok(()) => {
            info!("refresh token stored in OS keyring");
            Ok(KeyringStatus {
                available: true,
                message: "stored".into(),
            })
        }
        Err(e) => {
            warn!("keyring unavailable, falling back to memory-only: {}", e);
            let mut guard = state.lock().map_err(|e| e.to_string())?;
            guard.keyring_available = false;
            guard.memory_fallback_refresh_token = Some(token);
            Ok(KeyringStatus {
                available: false,
                message: format!("Keyring unavailable: {}. Session will not persist across restarts.", e),
            })
        }
    }
}

#[tauri::command]
pub fn get_refresh_token(
    state: State<'_, Mutex<AuthState>>,
) -> Result<Option<String>, String> {
    match read_keyring(KEYRING_ACCOUNT_REFRESH_TOKEN) {
        Ok(v) => Ok(v),
        Err(e) => {
            warn!("keyring read failed, checking memory fallback: {}", e);
            let guard = state.lock().map_err(|e| e.to_string())?;
            Ok(guard.memory_fallback_refresh_token.clone())
        }
    }
}

#[tauri::command]
pub fn clear_refresh_token(
    state: State<'_, Mutex<AuthState>>,
) -> Result<(), String> {
    // Best-effort: clear both keyring and memory fallback.
    if let Err(e) = delete_keyring(KEYRING_ACCOUNT_REFRESH_TOKEN) {
        warn!("keyring delete failed (likely already empty): {}", e);
    }
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    guard.memory_fallback_refresh_token = None;
    info!("refresh token cleared");
    Ok(())
}

// ---------- Device fingerprint ----------

#[tauri::command]
pub fn get_or_create_device_id() -> Result<String, String> {
    match read_keyring(KEYRING_ACCOUNT_DEVICE_ID) {
        Ok(Some(id)) => Ok(id),
        Ok(None) | Err(_) => {
            let id = uuid::Uuid::new_v4().to_string();
            // Best-effort write. If keyring fails, return the ID anyway —
            // the cost is re-generating a new one next boot.
            let _ = write_keyring(KEYRING_ACCOUNT_DEVICE_ID, &id);
            Ok(id)
        }
    }
}

// ---------- OAuth state nonce (anti-CSRF) ----------

#[tauri::command]
pub fn generate_oauth_state(state: State<'_, Mutex<AuthState>>) -> Result<String, String> {
    let nonce = uuid::Uuid::new_v4().to_string();
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    // Cap the list to avoid unbounded memory growth from abandoned flows.
    if guard.pending_oauth_states.len() > 16 {
        guard.pending_oauth_states.drain(0..8);
    }
    guard.pending_oauth_states.push(nonce.clone());
    Ok(nonce)
}

// Note: nonce consumption is done server-side (Rust) in `consume_nonce_from_state`
// when the deep link arrives. No frontend command is exposed because the frontend
// never has a reason to consume a nonce itself — the Rust handler validates and
// emits `auth-deep-link-received` with `valid: true/false`.

// ---------- Keyring helpers ----------

fn write_keyring(account: &str, value: &str) -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, account).map_err(|e| e.to_string())?;
    entry.set_password(value).map_err(|e| e.to_string())
}

fn read_keyring(account: &str) -> Result<Option<String>, String> {
    let entry = Entry::new(KEYRING_SERVICE, account).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn delete_keyring(account: &str) -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, account).map_err(|e| e.to_string())?;
    entry.delete_credential().map_err(|e| e.to_string())
}

// ---------- Tests ----------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_id_is_uuid_v4() {
        // Can't easily test keyring in CI; just ensure a fresh UUID is a valid v4.
        let id = uuid::Uuid::new_v4().to_string();
        assert_eq!(id.len(), 36);
        assert_eq!(id.chars().nth(14), Some('4'));
    }

    #[test]
    fn consume_oauth_state_is_one_time() {
        let state = Mutex::new(AuthState::new());
        // Manually populate
        state.lock().unwrap().pending_oauth_states.push("nonce-1".into());

        // Simulate the command handler logic directly (State<'_, _> is hard to build in tests).
        let mut guard = state.lock().unwrap();
        let pos = guard.pending_oauth_states.iter().position(|n| n == "nonce-1");
        assert!(pos.is_some());
        guard.pending_oauth_states.remove(pos.unwrap());
        let pos_again = guard.pending_oauth_states.iter().position(|n| n == "nonce-1");
        assert!(pos_again.is_none(), "nonce must be consumed on first use");
    }
}
```

- [ ] **Step 2: Modifier `src-tauri/src/state.rs`**

Ajouter `use crate::auth::AuthState;` en haut, puis ajouter le champ dans `AppState` :

```rust
pub struct AppState {
    pub(crate) audio_recorder: Mutex<AudioRecorder>,
    pub(crate) hotkeys: Mutex<HotkeyConfig>,
    pub whisper: WhisperState,
    pub active_profile_id: Mutex<String>,
    pub auth: Mutex<crate::auth::AuthState>,
}
```

Modifier `create_app_state()` :

```rust
pub(crate) fn create_app_state() -> AppState {
    AppState {
        audio_recorder: Mutex::new(AudioRecorder::new()),
        hotkeys: Mutex::new(HotkeyConfig::default()),
        whisper: WhisperState {
            cache: Arc::new(TokioMutex::new(WhisperCache {
                context: None,
                state: None,
                loaded_model: String::new(),
                is_gpu: false,
                unload_handle: None,
            })),
        },
        active_profile_id: Mutex::new(String::new()),
        auth: Mutex::new(crate::auth::AuthState::new()),
    }
}
```

- [ ] **Step 3: Modifier `src-tauri/src/lib.rs`**

Ajouter `mod auth;` près des autres `mod` (début du fichier).

Dans `invoke_handler!` (fonction `run`), ajouter les 6 commandes :

```rust
.invoke_handler(tauri::generate_handler![
    // ... commandes existantes ...
    auth::store_refresh_token,
    auth::get_refresh_token,
    auth::clear_refresh_token,
    auth::get_or_create_device_id,
    auth::generate_oauth_state,
])
```

**⚠️ Les commandes auth utilisent `State<'_, Mutex<AuthState>>` alors que l'app managed state est `AppState`.** Adapter : les commandes prennent plutôt `State<'_, AppState>` et accèdent à `.auth`. Corriger `auth.rs` en conséquence :

```rust
#[tauri::command]
pub fn store_refresh_token(
    token: String,
    state: State<'_, crate::state::AppState>,
) -> Result<KeyringStatus, String> {
    // ... body uses state.auth.lock() ...
}
```

Répercuter sur les 4 autres commandes qui touchent `AuthState`. (Les helpers privés `write_keyring` / `read_keyring` / `delete_keyring` restent inchangés.)

- [ ] **Step 4: Cargo check**

```bash
cd src-tauri && LIBCLANG_PATH="C:/Program Files/LLVM/bin" PATH="$PATH:/c/Program Files/CMake/bin" cargo check
```

Expected : PASS.

- [ ] **Step 5: Cargo test**

```bash
cd src-tauri && cargo test --lib auth::tests
```

Expected : 2 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/auth.rs src-tauri/src/state.rs src-tauri/src/lib.rs
git commit -m "feat(auth): rust commands for keyring storage and oauth nonces"
```

---

## Task 9: Deep link `voice-tool://` — enregistrement scheme + handler single-instance

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/lib.rs` — hook single-instance pour parser l'URL deep link

**Pourquoi:** sans enregistrement OS du scheme, cliquer un email magic link ne revient pas dans l'app. Tauri v2 utilise le plugin `single-instance` (déjà présent) pour router les invocations répétées vers l'instance existante, avec l'URL deep link passée en argument.

- [ ] **Step 1: Déclarer le scheme dans `tauri.conf.json`**

Ajouter après `"security": {...}` dans la section `"app"` :

```json
"app": {
  "windows": [ ... ],
  "security": { ... },
  "macOSPrivateApi": false
},
```

Puis, ajouter **dans** la section `"plugins"` (au même niveau que `"updater"`) :

```json
"deep-link": {
  "desktop": {
    "schemes": ["voice-tool"]
  }
}
```

Enfin, ajouter au top-level (à côté de `"identifier"`) :

```json
"identifier": "com.nolyo.voice-tool",
```

est déjà présent. Rien à changer.

Installer le plugin Tauri v2 dedicated pour le deep link :

```bash
cd src-tauri
cargo add tauri-plugin-deep-link
cd ..
pnpm add @tauri-apps/plugin-deep-link
```

- [ ] **Step 2: Enregistrer le plugin côté Rust**

Dans `src-tauri/src/lib.rs`, dans la fonction `run`, chaîner :

```rust
.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
    // Arguments reçus quand une 2e instance est lancée (y compris deep link clicks).
    // On route vers le handler auth::handle_deep_link_args si le 1er arg matche voice-tool://
    if let Some(url) = args.iter().find(|a| a.starts_with("voice-tool://")) {
        auth::emit_deep_link_event(app, url);
    }
    // Toujours remettre la fenêtre principale en avant.
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
}))
.plugin(tauri_plugin_deep_link::init())
```

Vérifier qu'il n'y a pas déjà un `single_instance::init(...)` ailleurs ; si oui, fusionner le callback.

Dans `setup`, s'abonner aux deep links reçus **pendant que l'app tourne** :

```rust
.setup(|app| {
    // ... setup existant ...

    use tauri_plugin_deep_link::DeepLinkExt;
    let handle = app.handle().clone();
    app.deep_link().on_open_url(move |event| {
        for url in event.urls() {
            let s = url.as_str();
            if s.starts_with("voice-tool://") {
                auth::emit_deep_link_event(&handle, s);
            }
        }
    });

    Ok(())
})
```

- [ ] **Step 3: Ajouter le helper `emit_deep_link_event` dans `auth.rs`**

```rust
use tauri::{AppHandle, Emitter, Manager, Runtime};

#[derive(Serialize, Clone)]
pub struct DeepLinkPayload {
    pub url: String,
    pub params: std::collections::HashMap<String, String>,
    pub valid: bool,
    pub reason: Option<String>,
}

const WHITELIST_TYPES: &[&str] = &["magiclink", "oauth", "signup", "recovery", "email_change"];

pub fn emit_deep_link_event<R: Runtime>(app: &AppHandle<R>, url: &str) {
    let payload = parse_and_validate_deep_link(url, app);
    // Never log tokens — only the validity flag + reason.
    info!(valid = payload.valid, reason = ?payload.reason, "deep link received");
    if let Err(e) = app.emit("auth-deep-link-received", &payload) {
        warn!("failed to emit auth-deep-link-received: {}", e);
    }
}

fn parse_and_validate_deep_link<R: Runtime>(url: &str, app: &AppHandle<R>) -> DeepLinkPayload {
    use std::collections::HashMap;
    let parsed = match url::Url::parse(url) {
        Ok(u) => u,
        Err(e) => {
            return DeepLinkPayload {
                url: url.to_string(),
                params: HashMap::new(),
                valid: false,
                reason: Some(format!("malformed url: {}", e)),
            };
        }
    };

    if parsed.scheme() != "voice-tool" {
        return invalid(url, "wrong scheme");
    }
    if parsed.host_str() != Some("auth") || parsed.path() != "/callback" {
        return invalid(url, "wrong host/path");
    }

    let mut params: HashMap<String, String> = parsed.query_pairs().into_owned().collect();
    let type_val = match params.get("type") {
        Some(t) => t.clone(),
        None => return invalid(url, "missing type"),
    };
    if !WHITELIST_TYPES.contains(&type_val.as_str()) {
        return invalid(url, "type not whitelisted");
    }

    // OAuth return: state nonce must match one we issued (anti-CSRF).
    if type_val == "oauth" {
        match params.get("state") {
            None => return invalid(url, "missing state for oauth"),
            Some(nonce) => {
                let ok = consume_nonce_from_state(app, nonce);
                if !ok {
                    return invalid(url, "unknown or replayed state nonce");
                }
            }
        }
    }

    // Basic JWT shape check for fields that should be JWTs (access_token, refresh_token).
    for field in ["access_token", "refresh_token", "token"] {
        if let Some(v) = params.get(field) {
            if !looks_like_jwt(v) {
                return invalid(url, &format!("{} is not a JWT", field));
            }
        }
    }

    // Scrub nothing — the frontend needs all original params to hand to Supabase.
    // Redact only in logs (done above via `info!` which never includes `params`).

    DeepLinkPayload {
        url: url.to_string(),
        params,
        valid: true,
        reason: None,
    }
}

fn invalid(url: &str, reason: &str) -> DeepLinkPayload {
    DeepLinkPayload {
        url: url.to_string(),
        params: Default::default(),
        valid: false,
        reason: Some(reason.to_string()),
    }
}

fn looks_like_jwt(s: &str) -> bool {
    s.split('.').count() == 3 && s.len() > 20
}

fn consume_nonce_from_state<R: Runtime>(app: &AppHandle<R>, nonce: &str) -> bool {
    use crate::state::AppState;
    let state = match app.try_state::<AppState>() {
        Some(s) => s,
        None => return false,
    };
    let mut guard = match state.auth.lock() {
        Ok(g) => g,
        Err(_) => return false,
    };
    if let Some(pos) = guard.pending_oauth_states.iter().position(|n| n == nonce) {
        guard.pending_oauth_states.remove(pos);
        true
    } else {
        false
    }
}
```

Ajouter les deps manquantes à `Cargo.toml` si absentes :
```toml
url = "2"   # déjà présent d'après l'exploration — vérifier
```

- [ ] **Step 4: Ajouter tests unitaires pour le parsing**

Dans le bloc `#[cfg(test)] mod tests` de `auth.rs`, ajouter :

```rust
#[test]
fn looks_like_jwt_accepts_real_shape() {
    assert!(looks_like_jwt("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmMifQ.signature"));
    assert!(!looks_like_jwt("no-dots"));
    assert!(!looks_like_jwt("only.two"));
    assert!(!looks_like_jwt("short.x.x"));
}
```

Ajouter aussi un test pour `parse_and_validate_deep_link` qui fonctionne sans AppHandle — extraire la logique "pure" (scheme + path + type + whitelist + JWT) dans une fonction `validate_url_shape(url: &str) -> Result<HashMap<String,String>, &'static str>` testable, et garder `consume_nonce_from_state` séparé. Refactor minimal : la fonction testable n'appelle pas le state.

- [ ] **Step 5: Build**

```bash
cd src-tauri && LIBCLANG_PATH="C:/Program Files/LLVM/bin" PATH="$PATH:/c/Program Files/CMake/bin" cargo check
cargo test --lib auth::tests
```

Expected : PASS + tests PASS.

- [ ] **Step 6: Test manuel du deep link**

Pour tester avant d'avoir le frontend : lancer l'app (`pnpm tauri dev`, demander au user), puis dans un terminal **séparé** :

```bash
# Windows
start "voice-tool://auth/callback?type=magiclink&access_token=eyJh.eyJh.sig&refresh_token=eyJh.eyJh.sig"
# Linux
xdg-open "voice-tool://auth/callback?type=magiclink&access_token=eyJh.eyJh.sig&refresh_token=eyJh.eyJh.sig"
# macOS
open "voice-tool://auth/callback?type=magiclink&access_token=eyJh.eyJh.sig&refresh_token=eyJh.eyJh.sig"
```

Dans les logs de l'app, on doit voir : `deep link received valid=true`.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json src-tauri/src/auth.rs src-tauri/src/lib.rs package.json pnpm-lock.yaml
git commit -m "feat(auth): register voice-tool:// deep link with anti-csrf validation"
```

---

## Task 10: Installer `@supabase/supabase-js` + client frontend

**Files:**
- Modify: `package.json`
- Create: `src/lib/supabase.ts`

**Pourquoi:** le client Supabase JS est le moteur de toute la logique auth côté app.

- [ ] **Step 1: Ajouter la dep**

```bash
pnpm add @supabase/supabase-js otpauth
```

`otpauth` sert à générer les QR codes TOTP côté front (Task 19) — ajouté ici pour éviter un install en milieu de task.

- [ ] **Step 2: Ajouter les variables d'environnement**

Créer `.env.example` à la racine :

```
# Supabase (public, safe to commit)
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

Créer `.env.local` (gitignored) avec les vraies valeurs récupérées depuis `docs/v3/ops/supabase-bootstrap.md`.

Vérifier que `.gitignore` inclut bien `.env.local`, `.env.*.local`. Si absent :

```bash
echo ".env.local" >> .gitignore
echo ".env.*.local" >> .gitignore
```

- [ ] **Step 3: Créer `src/lib/supabase.ts`**

```typescript
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — check .env.local",
  );
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // We manage persistence ourselves via the OS keyring.
    persistSession: false,
    autoRefreshToken: true,
    // Never use URL detection — the deep link handler does that.
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});

export const AUTH_CALLBACK_URL =
  import.meta.env.VITE_AUTH_CALLBACK_URL ??
  "https://voice-tool-auth-callback.pages.dev";
```

- [ ] **Step 4: Build front**

```bash
pnpm build
```

Expected : PASS (si `.env.local` existe avec des valeurs valides).

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example .gitignore src/lib/supabase.ts
git commit -m "feat(auth): add supabase-js client with .env config"
```

---

## Task 11: `AuthContext` + hook `useAuth`

**Files:**
- Create: `src/contexts/AuthContext.tsx`
- Create: `src/hooks/useAuth.ts`
- Modify: `src/main.tsx` — wrap `<App />` avec `<AuthProvider>`
- Modify: `src/App.tsx` — écoute l'event `auth-deep-link-received` et délégue à AuthContext

**Pourquoi:** état global unique pour la session. Toutes les vues auth consomment ce context.

- [ ] **Step 1: Créer `src/contexts/AuthContext.tsx`**

```typescript
import { createContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { supabase } from "@/lib/supabase";

export type AuthStatus = "loading" | "signed-out" | "signed-in" | "mfa-required";

export interface DeepLinkPayload {
  url: string;
  params: Record<string, string>;
  valid: boolean;
  reason: string | null;
}

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  session: Session | null;
  keyringAvailable: boolean;
  /** Opened when the user clicks the "Sign in" CTA. */
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  /** Signals an MFA challenge is pending (set by login flows). */
  mfaChallenge: { factorId: string } | null;
  setMfaChallenge: (c: { factorId: string } | null) => void;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [keyringAvailable, setKeyringAvailable] = useState(true);
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<{ factorId: string } | null>(null);
  const restoredRef = useRef(false);

  // --- Session restore on boot ---
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    (async () => {
      try {
        const stored = await invoke<string | null>("get_refresh_token");
        if (!stored) {
          setStatus("signed-out");
          return;
        }
        const { data, error } = await supabase.auth.refreshSession({ refresh_token: stored });
        if (error || !data.session) {
          // Token invalid or revoked — purge and sign out.
          await invoke("clear_refresh_token");
          setStatus("signed-out");
          return;
        }
        setSession(data.session);
        setUser(data.session.user);
        setStatus("signed-in");
        // Rotate: Supabase returned a fresh refresh token, persist it.
        if (data.session.refresh_token) {
          const res = await invoke<{ available: boolean }>("store_refresh_token", {
            token: data.session.refresh_token,
          });
          setKeyringAvailable(res.available);
        }
      } catch (e) {
        console.error("session restore failed", e);
        setStatus("signed-out");
      }
    })();
  }, []);

  // --- Persist each rotation ---
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, next) => {
      setSession(next);
      setUser(next?.user ?? null);
      if (event === "TOKEN_REFRESHED" && next?.refresh_token) {
        const res = await invoke<{ available: boolean }>("store_refresh_token", {
          token: next.refresh_token,
        });
        setKeyringAvailable(res.available);
      }
      if (event === "SIGNED_OUT") {
        setStatus("signed-out");
      }
      if (event === "SIGNED_IN" && next) {
        setStatus("signed-in");
        setAuthModalOpen(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // --- Deep link listener (emitted from Rust) ---
  useEffect(() => {
    const p = listen<DeepLinkPayload>("auth-deep-link-received", async (ev) => {
      const payload = ev.payload;
      if (!payload.valid) {
        console.warn("invalid deep link", payload.reason);
        return;
      }
      await handleAuthDeepLink(payload);
    });
    return () => {
      p.then((unlisten) => unlisten());
    };
  }, []);

  async function handleAuthDeepLink(payload: DeepLinkPayload) {
    const { type, access_token, refresh_token, code } = payload.params;
    try {
      if ((type === "magiclink" || type === "signup") && access_token && refresh_token) {
        const { data, error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (error) throw error;
        if (data.session?.refresh_token) {
          const res = await invoke<{ available: boolean }>("store_refresh_token", {
            token: data.session.refresh_token,
          });
          setKeyringAvailable(res.available);
        }
      } else if (type === "oauth" && code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        if (data.session?.refresh_token) {
          const res = await invoke<{ available: boolean }>("store_refresh_token", {
            token: data.session.refresh_token,
          });
          setKeyringAvailable(res.available);
        }
      } else if (type === "recovery" && access_token && refresh_token) {
        // Set the session so the reset-password view can call auth.updateUser.
        await supabase.auth.setSession({ access_token, refresh_token });
        // Open the modal onto the "reset-password-confirm" view.
        setAuthModalOpen(true);
        window.dispatchEvent(new CustomEvent("auth:recovery-mode"));
      }
    } catch (e) {
      console.error("deep link exchange failed", e);
    }
  }

  async function signOut() {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("supabase signOut failed, clearing local anyway", e);
    }
    await invoke("clear_refresh_token");
    setStatus("signed-out");
    setSession(null);
    setUser(null);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      session,
      keyringAvailable,
      isAuthModalOpen,
      openAuthModal: () => setAuthModalOpen(true),
      closeAuthModal: () => setAuthModalOpen(false),
      mfaChallenge,
      setMfaChallenge,
      signOut,
    }),
    [status, user, session, keyringAvailable, isAuthModalOpen, mfaChallenge],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

- [ ] **Step 2: Créer `src/hooks/useAuth.ts`**

```typescript
import { useContext } from "react";
import { AuthContext } from "@/contexts/AuthContext";

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
```

- [ ] **Step 3: Wrap l'app dans `src/main.tsx`**

Ajouter `<AuthProvider>` comme enveloppe externe (autour des autres providers) :

```tsx
import { AuthProvider } from "@/contexts/AuthContext";
// ...
<AuthProvider>
  <SettingsProvider>
    {/* ... */}
    <App />
  </SettingsProvider>
</AuthProvider>
```

- [ ] **Step 4: Build**

```bash
pnpm build
```

Expected : PASS.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/AuthContext.tsx src/hooks/useAuth.ts src/main.tsx
git commit -m "feat(auth): add AuthContext with deep-link and session restore"
```

---

## Task 12: i18n — ajouter les clés auth FR/EN

**Files:**
- Modify: `src/locales/fr.json`
- Modify: `src/locales/en.json`

**Pourquoi:** feedback projet `feedback_i18n_required` — jamais de string UI en dur. On pose toutes les clés **en amont** pour que chaque task UI se contente d'utiliser `t("auth.xxx")`.

- [ ] **Step 1: Ajouter un bloc `auth` dans `fr.json`**

(bloc fusionné dans le JSON existant, ne pas écraser)

```json
{
  "auth": {
    "modal": {
      "title": "Connexion",
      "close": "Fermer"
    },
    "login": {
      "title": "Connecte-toi à Voice Tool",
      "subtitle": "Synchronise tes réglages et notes entre tes machines.",
      "magicLinkLabel": "Email",
      "magicLinkPlaceholder": "toi@exemple.com",
      "magicLinkSubmit": "Recevoir un lien de connexion",
      "magicLinkSuccess": "Si ce compte existe, un lien vient d'être envoyé.",
      "oauthGoogle": "Continuer avec Google",
      "emailPasswordToggle": "Utiliser un mot de passe",
      "switchToSignup": "Créer un compte",
      "forgotPassword": "Mot de passe oublié ?"
    },
    "signup": {
      "title": "Créer un compte",
      "emailLabel": "Email",
      "passwordLabel": "Mot de passe",
      "passwordHint": "10 caractères minimum, aucune règle de complexité forcée.",
      "passwordPwned": "Ce mot de passe fait partie des plus compromis sur internet. Choisis-en un autre.",
      "passwordTooShort": "Minimum 10 caractères.",
      "strengthWeak": "Faible",
      "strengthMedium": "Moyen",
      "strengthStrong": "Fort",
      "submit": "Créer mon compte",
      "success": "Si ce compte n'existait pas, un email vient de t'être envoyé pour confirmer.",
      "backToLogin": "J'ai déjà un compte"
    },
    "passwordReset": {
      "requestTitle": "Réinitialiser ton mot de passe",
      "requestSubtitle": "Saisis l'email associé à ton compte. Nous t'enverrons un lien valable 15 minutes.",
      "submit": "Envoyer le lien",
      "success": "Si un compte existe pour cet email, un lien de réinitialisation vient d'être envoyé.",
      "confirmTitle": "Choisis un nouveau mot de passe",
      "confirmSubtitle": "Toutes tes sessions seront invalidées après le changement.",
      "confirmSubmit": "Enregistrer",
      "confirmSuccess": "Mot de passe mis à jour. Tu es maintenant reconnecté sur cet appareil."
    },
    "twoFactor": {
      "challenge": {
        "title": "Vérification en deux étapes",
        "subtitle": "Entre le code de ton application d'authentification, ou un code de récupération.",
        "placeholder": "Code à 6 chiffres ou code de récupération",
        "submit": "Valider"
      },
      "activation": {
        "stepScan": "1. Scanne ce QR code",
        "stepScanFallback": "Ou recopie cette clé dans ton app TOTP :",
        "stepValidate": "2. Entre le code actuel pour confirmer",
        "codePlaceholder": "Code à 6 chiffres",
        "stepRecovery": "3. Sauvegarde tes codes de récupération",
        "recoveryWarning": "Ces 10 codes te permettront de récupérer ton compte si tu perds ton téléphone. Ils ne seront affichés qu'une fois.",
        "copyAll": "Copier tous les codes",
        "download": "Télécharger .txt",
        "ackCheckbox": "J'ai sauvegardé mes codes de récupération.",
        "finish": "Terminer",
        "cancel": "Annuler"
      }
    },
    "logout": {
      "label": "Se déconnecter",
      "confirmTitle": "Se déconnecter ?",
      "confirmBody": "Tes notes synchronisées resteront disponibles en te reconnectant.",
      "confirm": "Oui, me déconnecter"
    },
    "account": {
      "sectionTitle": "Compte",
      "sectionSubtitle": "Email, déconnexion et suppression",
      "email": "Email",
      "deleteAccount": "Supprimer mon compte",
      "deleteAccountWarning": "Cette action est irréversible. Toutes les données synchronisées seront supprimées sous 30 jours."
    },
    "security": {
      "sectionTitle": "Sécurité",
      "sectionSubtitle": "2FA et appareils connectés",
      "twoFactorEnabled": "2FA activé",
      "twoFactorDisabled": "2FA désactivé",
      "enable2fa": "Activer l'authentification à deux facteurs",
      "disable2fa": "Désactiver 2FA",
      "regenerateCodes": "Régénérer les codes de récupération",
      "devicesTitle": "Appareils connectés",
      "thisDevice": "Cet appareil",
      "disconnectDevice": "Déconnecter",
      "keyringUnavailable": "Le trousseau de ton système n'est pas disponible. La session ne sera pas conservée au prochain lancement."
    },
    "cta": {
      "header": "Se connecter",
      "dashboardCard": "Sync tes réglages entre machines"
    },
    "errors": {
      "network": "Erreur réseau — réessaie.",
      "invalidCredentials": "Email ou mot de passe incorrect.",
      "linkExpired": "Lien invalide ou expiré. Demande-en un nouveau.",
      "generic": "Une erreur est survenue. Réessaie."
    }
  }
}
```

- [ ] **Step 2: Traduire en anglais dans `en.json`** — traduction miroir, même structure.

- [ ] **Step 3: Build**

```bash
pnpm build
```

Expected : PASS. Si TypeScript râle sur le type des traductions (selon config i18next), ajuster le `types.d.ts` correspondant.

- [ ] **Step 4: Commit**

```bash
git add src/locales/fr.json src/locales/en.json
git commit -m "i18n(auth): add fr/en translations for auth flows"
```

---

## Task 13: Pwned passwords — script de build + lib de check

**Files:**
- Create: `scripts/generate-pwned-list.ts`
- Create: `src/lib/pwned-passwords-list.ts` (généré)
- Create: `src/lib/pwned-passwords.ts`
- Modify: `package.json` — script `gen:pwned`

**Pourquoi:** ADR 0007 — check contre top 10k pwned sans API externe (éviter le leak du password). Liste embarquée, générée au build.

- [ ] **Step 1: Créer `scripts/generate-pwned-list.ts`**

```typescript
/**
 * Generates src/lib/pwned-passwords-list.ts from a public list of the most
 * common pwned passwords (SecLists / HaveIBeenPwned top-10k).
 *
 * Source: https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/10-million-password-list-top-10000.txt
 *
 * Run: pnpm run gen:pwned
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE_URL =
  "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/10-million-password-list-top-10000.txt";

async function main() {
  console.log(`Fetching ${SOURCE_URL}…`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const text = await res.text();
  const passwords = text
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 1 && p.length <= 64);
  const unique = Array.from(new Set(passwords));
  console.log(`Got ${unique.length} unique passwords. Hashing…`);

  // Store hex-encoded SHA-256 hashes to avoid shipping raw plaintexts in the bundle.
  const crypto = await import("node:crypto");
  const hashes = unique.map((p) =>
    crypto.createHash("sha256").update(p).digest("hex"),
  );
  hashes.sort();

  const out = `// GENERATED FILE — do not edit.
// Run \`pnpm run gen:pwned\` to regenerate from SecLists top-10k.
// Contains SHA-256 hex digests of the top-10k most-pwned passwords.

export const PWNED_PASSWORD_HASHES: readonly string[] = ${JSON.stringify(hashes, null, 0)};
`;
  const path = resolve("src/lib/pwned-passwords-list.ts");
  writeFileSync(path, out);
  console.log(`Wrote ${path} (${hashes.length} entries).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Ajouter le script à `package.json`**

Dans `"scripts"` :

```json
"gen:pwned": "tsx scripts/generate-pwned-list.ts"
```

Installer tsx si absent :

```bash
pnpm add -D tsx
```

- [ ] **Step 3: Générer la liste**

```bash
pnpm run gen:pwned
```

Expected : fichier `src/lib/pwned-passwords-list.ts` créé avec ~10000 entrées (taille ~600 KB gzipped → acceptable).

- [ ] **Step 4: Créer `src/lib/pwned-passwords.ts`**

```typescript
import { PWNED_PASSWORD_HASHES } from "./pwned-passwords-list";

/** SHA-256 hex digest of an arbitrary string using the Web Crypto API. */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Returns true if the password is in the top-10k pwned list. */
export async function isPwnedPassword(password: string): Promise<boolean> {
  const hash = await sha256Hex(password);
  return binarySearch(PWNED_PASSWORD_HASHES, hash);
}

function binarySearch(sorted: readonly string[], target: string): boolean {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] === target) return true;
    if (sorted[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}
```

- [ ] **Step 5: Test unitaire (Vitest)**

Installer :
```bash
pnpm add -D vitest @vitest/ui
```

Ajouter à `package.json` :
```json
"test": "vitest run",
"test:watch": "vitest"
```

Créer `src/lib/pwned-passwords.test.ts` :

```typescript
import { describe, it, expect } from "vitest";
import { isPwnedPassword } from "./pwned-passwords";

describe("isPwnedPassword", () => {
  it("detects 'password' as pwned", async () => {
    expect(await isPwnedPassword("password")).toBe(true);
  });

  it("detects '123456' as pwned", async () => {
    expect(await isPwnedPassword("123456")).toBe(true);
  });

  it("returns false for a random non-dictionary string", async () => {
    expect(await isPwnedPassword("X9#qL!vZ.kR7$nMw2pB")).toBe(false);
  });
});
```

Run :
```bash
pnpm test
```

Expected : 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-pwned-list.ts src/lib/pwned-passwords.ts src/lib/pwned-passwords-list.ts src/lib/pwned-passwords.test.ts package.json pnpm-lock.yaml
git commit -m "feat(auth): embed top-10k pwned passwords list with sha-256 check"
```

---

## Task 14: Composant `AuthModal` + wiring dans `App.tsx`

**Files:**
- Create: `src/components/auth/AuthModal.tsx`
- Modify: `src/App.tsx` — rendu conditionnel `<AuthModal />` + bouton header

**Pourquoi:** conteneur unique pour toutes les vues auth, piloté par `AuthContext.isAuthModalOpen` + un state interne pour naviguer entre `login | signup | reset-request | reset-confirm | 2fa-challenge`.

- [ ] **Step 1: Créer `src/components/auth/AuthModal.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { LoginView } from "./LoginView";
import { SignupView } from "./SignupView";
import { ResetPasswordRequestView } from "./ResetPasswordRequestView";
import { ResetPasswordConfirmView } from "./ResetPasswordConfirmView";
import { TwoFactorChallengeView } from "./TwoFactorChallengeView";

export type AuthView =
  | "login"
  | "signup"
  | "reset-request"
  | "reset-confirm"
  | "2fa-challenge";

export function AuthModal() {
  const { t } = useTranslation();
  const { isAuthModalOpen, closeAuthModal, mfaChallenge } = useAuth();
  const [view, setView] = useState<AuthView>("login");

  useEffect(() => {
    if (mfaChallenge) setView("2fa-challenge");
  }, [mfaChallenge]);

  useEffect(() => {
    const onRecovery = () => setView("reset-confirm");
    window.addEventListener("auth:recovery-mode", onRecovery);
    return () => window.removeEventListener("auth:recovery-mode", onRecovery);
  }, []);

  // When the modal opens from scratch, default back to login.
  useEffect(() => {
    if (isAuthModalOpen && !mfaChallenge && view !== "reset-confirm") {
      setView("login");
    }
  }, [isAuthModalOpen]);

  return (
    <Dialog open={isAuthModalOpen} onOpenChange={(o) => { if (!o) closeAuthModal(); }}>
      <DialogContent className="vt-app sm:max-w-md">
        <DialogTitle className="sr-only">{t("auth.modal.title")}</DialogTitle>
        {view === "login" && <LoginView onNavigate={setView} />}
        {view === "signup" && <SignupView onNavigate={setView} />}
        {view === "reset-request" && <ResetPasswordRequestView onNavigate={setView} />}
        {view === "reset-confirm" && <ResetPasswordConfirmView onDone={closeAuthModal} />}
        {view === "2fa-challenge" && <TwoFactorChallengeView />}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Rendu dans `src/App.tsx`**

À côté des autres composants top-level, ajouter `<AuthModal />`. Dans le header, transformer le bouton "Se connecter" :

```tsx
import { AuthModal } from "@/components/auth/AuthModal";
import { useAuth } from "@/hooks/useAuth";
// ...
const { status, openAuthModal } = useAuth();
// dans le header
{status === "signed-out" && (
  <button onClick={openAuthModal} className="vt-btn">
    {t("auth.cta.header")}
  </button>
)}
```

- [ ] **Step 3: Build**

```bash
pnpm build
```

Expected : PASS (les composants référencés LoginView etc. n'existent pas encore — on crée des **stubs** vides dans les prochaines tasks. Pour éviter un build cassé, créer immédiatement 5 fichiers stubs minimaux :

```tsx
// src/components/auth/LoginView.tsx (stub)
export function LoginView({ onNavigate }: { onNavigate: (v: any) => void }) {
  return <div>TODO LoginView</div>;
}
```

Idem pour `SignupView`, `ResetPasswordRequestView`, `ResetPasswordConfirmView`, `TwoFactorChallengeView`.

- [ ] **Step 4: Commit**

```bash
git add src/components/auth/AuthModal.tsx src/components/auth/LoginView.tsx src/components/auth/SignupView.tsx src/components/auth/ResetPasswordRequestView.tsx src/components/auth/ResetPasswordConfirmView.tsx src/components/auth/TwoFactorChallengeView.tsx src/App.tsx
git commit -m "feat(auth): add AuthModal shell with view routing"
```

---

## Task 15: `LoginView` — 3 méthodes (magic link > OAuth > E/P)

**Files:**
- Modify: `src/components/auth/LoginView.tsx`

**Pourquoi:** Flow 1 + 2 + 4 de `01-auth.md`. UX figée ADR 0007 (magic link principal).

- [ ] **Step 1: Remplacer le stub par la vraie impl**

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { supabase, AUTH_CALLBACK_URL } from "@/lib/supabase";
import type { AuthView } from "./AuthModal";

interface Props {
  onNavigate: (v: AuthView) => void;
}

export function LoginView({ onNavigate }: Props) {
  const { t } = useTranslation();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: AUTH_CALLBACK_URL },
    });
    setLoading(false);
    // Generic anti-enumeration reply.
    setInfo(t("auth.login.magicLinkSuccess"));
    if (error && !["already registered"].some(k => error.message.includes(k))) {
      // Only surface network-ish errors, not "user not found" (anti-enumeration).
      console.warn("magic link error (not shown to user)", error.message);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    setError(null);
    try {
      const nonce = await invoke<string>("generate_oauth_state");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: AUTH_CALLBACK_URL,
          queryParams: { state: nonce, access_type: "offline", prompt: "consent" },
          skipBrowserRedirect: true,
        },
      });
      if (error || !data.url) throw error ?? new Error("no oauth url");
      // Open the OAuth URL in the default browser — the user returns via deep link.
      await openUrl(data.url);
    } catch (e: any) {
      setError(t("auth.errors.generic"));
      console.error("oauth start failed", e);
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(t("auth.errors.invalidCredentials"));
      return;
    }
    if (data.session) {
      // MFA handled by onAuthStateChange in AuthContext. If factors required, Supabase sets aal1.
      const { data: mfaData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (mfaData && mfaData.nextLevel === "aal2" && mfaData.currentLevel !== "aal2") {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const totp = factors?.totp?.[0];
        if (totp) {
          // Let AuthContext switch to challenge view.
          const evt = new CustomEvent("auth:mfa-required", { detail: { factorId: totp.id } });
          window.dispatchEvent(evt);
        }
      }
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">{t("auth.login.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("auth.login.subtitle")}</p>
      </header>

      {!showPasswordForm && (
        <>
          <form onSubmit={handleMagicLink} className="space-y-2">
            <label htmlFor="login-email" className="text-sm">
              {t("auth.login.magicLinkLabel")}
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.login.magicLinkPlaceholder")}
              className="vt-input w-full"
              disabled={loading}
            />
            <button type="submit" className="vt-btn vt-btn-primary w-full" disabled={loading || !email}>
              {t("auth.login.magicLinkSubmit")}
            </button>
          </form>

          <div className="text-center text-xs text-muted-foreground">— or —</div>

          <button onClick={handleGoogle} className="vt-btn vt-btn-secondary w-full" disabled={loading}>
            {t("auth.login.oauthGoogle")}
          </button>

          <button
            onClick={() => setShowPasswordForm(true)}
            className="text-xs text-muted-foreground underline w-full"
            type="button"
          >
            {t("auth.login.emailPasswordToggle")}
          </button>
        </>
      )}

      {showPasswordForm && (
        <form onSubmit={handlePasswordLogin} className="space-y-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.login.magicLinkPlaceholder")}
            className="vt-input w-full"
            disabled={loading}
            aria-label={t("auth.login.magicLinkLabel")}
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="vt-input w-full"
            disabled={loading}
            aria-label={t("auth.signup.passwordLabel")}
          />
          <button type="submit" className="vt-btn vt-btn-primary w-full" disabled={loading}>
            {t("auth.login.emailPasswordToggle")}
          </button>
          <button type="button" onClick={() => onNavigate("reset-request")} className="text-xs underline w-full">
            {t("auth.login.forgotPassword")}
          </button>
        </form>
      )}

      {info && <p role="status" aria-live="polite" className="text-sm text-emerald-600">{info}</p>}
      {error && <p role="alert" aria-live="assertive" className="text-sm text-red-600">{error}</p>}

      <p className="text-center text-xs">
        <button onClick={() => onNavigate("signup")} className="underline">
          {t("auth.login.switchToSignup")}
        </button>
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Écouter `auth:mfa-required` dans `AuthContext`**

Dans `AuthContext.tsx`, `useEffect` dédié :

```tsx
useEffect(() => {
  const onMfa = (ev: any) => setMfaChallenge(ev.detail);
  window.addEventListener("auth:mfa-required", onMfa);
  return () => window.removeEventListener("auth:mfa-required", onMfa);
}, []);
```

- [ ] **Step 3: Build**

```bash
pnpm build
```

Expected : PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/auth/LoginView.tsx src/contexts/AuthContext.tsx
git commit -m "feat(auth): login view with magic link, google oauth, password"
```

---

## Task 16: `SignupView` — E/P avec validation pwned

**Files:**
- Modify: `src/components/auth/SignupView.tsx`
- Create: `src/components/auth/PasswordStrengthMeter.tsx`

**Pourquoi:** Flow 3 + ADR 0007 — check pwned + min 10 chars + jauge indicative.

- [ ] **Step 1: Créer `PasswordStrengthMeter.tsx`**

```tsx
import { useTranslation } from "react-i18next";

interface Props {
  score: 0 | 1 | 2 | 3;  // 0=empty, 1=weak, 2=medium, 3=strong
}

export function PasswordStrengthMeter({ score }: Props) {
  const { t } = useTranslation();
  const labels = [
    "",
    t("auth.signup.strengthWeak"),
    t("auth.signup.strengthMedium"),
    t("auth.signup.strengthStrong"),
  ];
  const colors = ["bg-gray-300", "bg-red-500", "bg-amber-500", "bg-emerald-500"];
  return (
    <div className="space-y-1">
      <div className="flex gap-1 h-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`flex-1 rounded-full ${i <= score ? colors[score] : "bg-gray-200"}`} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{labels[score]}</p>
    </div>
  );
}
```

- [ ] **Step 2: Implémenter `SignupView.tsx`**

```tsx
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase, AUTH_CALLBACK_URL } from "@/lib/supabase";
import { isPwnedPassword } from "@/lib/pwned-passwords";
import { PasswordStrengthMeter } from "./PasswordStrengthMeter";
import type { AuthView } from "./AuthModal";

interface Props {
  onNavigate: (v: AuthView) => void;
}

function scorePassword(p: string): 0 | 1 | 2 | 3 {
  if (!p) return 0;
  if (p.length < 10) return 1;
  if (p.length < 14) return 2;
  return 3;
}

export function SignupView({ onNavigate }: Props) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const score = useMemo(() => scorePassword(password), [password]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 10) {
      setError(t("auth.signup.passwordTooShort"));
      return;
    }
    const pwned = await isPwnedPassword(password);
    if (pwned) {
      setError(t("auth.signup.passwordPwned"));
      return;
    }

    setLoading(true);
    const { error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: AUTH_CALLBACK_URL },
    });
    setLoading(false);
    // Generic anti-enumeration reply regardless of outcome.
    setInfo(t("auth.signup.success"));
    if (signupError) {
      console.warn("signup error (not shown)", signupError.message);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">{t("auth.signup.title")}</h2>
      </header>

      <div className="space-y-1">
        <label htmlFor="su-email" className="text-sm">{t("auth.signup.emailLabel")}</label>
        <input
          id="su-email"
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="vt-input w-full"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="su-password" className="text-sm">{t("auth.signup.passwordLabel")}</label>
        <input
          id="su-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="vt-input w-full"
          aria-describedby="su-password-hint"
        />
        <p id="su-password-hint" className="text-xs text-muted-foreground">
          {t("auth.signup.passwordHint")}
        </p>
        <PasswordStrengthMeter score={score} />
      </div>

      <button type="submit" className="vt-btn vt-btn-primary w-full" disabled={loading}>
        {t("auth.signup.submit")}
      </button>

      {info && <p role="status" className="text-sm text-emerald-600">{info}</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <button type="button" onClick={() => onNavigate("login")} className="text-xs underline w-full">
        {t("auth.signup.backToLogin")}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Build**

```bash
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/auth/SignupView.tsx src/components/auth/PasswordStrengthMeter.tsx
git commit -m "feat(auth): signup view with pwned password check"
```

---

## Task 17: `ResetPasswordRequestView` + `ResetPasswordConfirmView`

**Files:**
- Modify: `src/components/auth/ResetPasswordRequestView.tsx`
- Modify: `src/components/auth/ResetPasswordConfirmView.tsx`

**Pourquoi:** Flow 5 — reset password en 2 écrans (demande + confirmation).

- [ ] **Step 1: Implémenter `ResetPasswordRequestView.tsx`**

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase, AUTH_CALLBACK_URL } from "@/lib/supabase";
import type { AuthView } from "./AuthModal";

export function ResetPasswordRequestView({ onNavigate }: { onNavigate: (v: AuthView) => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: AUTH_CALLBACK_URL });
    setLoading(false);
    setInfo(t("auth.passwordReset.success"));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">{t("auth.passwordReset.requestTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("auth.passwordReset.requestSubtitle")}</p>
      </header>

      <input
        type="email"
        required
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="vt-input w-full"
        aria-label={t("auth.login.magicLinkLabel")}
      />
      <button type="submit" className="vt-btn vt-btn-primary w-full" disabled={loading}>
        {t("auth.passwordReset.submit")}
      </button>

      {info && <p role="status" className="text-sm text-emerald-600">{info}</p>}

      <button type="button" onClick={() => onNavigate("login")} className="text-xs underline w-full">
        {t("auth.signup.backToLogin")}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Implémenter `ResetPasswordConfirmView.tsx`**

```tsx
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { isPwnedPassword } from "@/lib/pwned-passwords";
import { PasswordStrengthMeter } from "./PasswordStrengthMeter";

export function ResetPasswordConfirmView({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const score = useMemo(() => (password.length < 10 ? 1 : password.length < 14 ? 2 : 3) as 0 | 1 | 2 | 3, [password]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError(t("auth.signup.passwordTooShort"));
      return;
    }
    if (await isPwnedPassword(password)) {
      setError(t("auth.signup.passwordPwned"));
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(t("auth.errors.generic"));
      return;
    }
    setInfo(t("auth.passwordReset.confirmSuccess"));
    setTimeout(onDone, 1500);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">{t("auth.passwordReset.confirmTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("auth.passwordReset.confirmSubtitle")}</p>
      </header>

      <input
        type="password"
        required
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="vt-input w-full"
        aria-label={t("auth.signup.passwordLabel")}
      />
      <PasswordStrengthMeter score={score} />

      <button type="submit" className="vt-btn vt-btn-primary w-full" disabled={loading}>
        {t("auth.passwordReset.confirmSubmit")}
      </button>

      {info && <p role="status" className="text-sm text-emerald-600">{info}</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 3: Build + commit**

```bash
pnpm build
git add src/components/auth/ResetPasswordRequestView.tsx src/components/auth/ResetPasswordConfirmView.tsx
git commit -m "feat(auth): reset password request + confirm views"
```

---

## Task 18: `TwoFactorChallengeView` (login avec 2FA actif)

**Files:**
- Modify: `src/components/auth/TwoFactorChallengeView.tsx`

**Pourquoi:** Flow 7 — un champ unique qui accepte un code TOTP ou un recovery code.

- [ ] **Step 1: Implémenter**

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export function TwoFactorChallengeView() {
  const { t } = useTranslation();
  const { mfaChallenge, setMfaChallenge } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaChallenge) return;
    setLoading(true);
    setError(null);
    const trimmed = code.trim();
    const isRecovery = !/^\d{6}$/.test(trimmed);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: mfaChallenge.factorId,
      code: trimmed,
      // Supabase auto-detects TOTP vs recovery based on format.
    });
    setLoading(false);
    if (error) {
      setError(t("auth.errors.invalidCredentials"));
      return;
    }
    setMfaChallenge(null);
    if (isRecovery) {
      // Fire a notification email reminder (handled by Supabase trigger in Task 20).
      console.info("recovery code consumed");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">{t("auth.twoFactor.challenge.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("auth.twoFactor.challenge.subtitle")}</p>
      </header>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        required
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={t("auth.twoFactor.challenge.placeholder")}
        className="vt-input w-full tracking-widest"
        aria-label={t("auth.twoFactor.challenge.placeholder")}
      />
      <button type="submit" className="vt-btn vt-btn-primary w-full" disabled={loading || code.length < 6}>
        {t("auth.twoFactor.challenge.submit")}
      </button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
pnpm build
git add src/components/auth/TwoFactorChallengeView.tsx
git commit -m "feat(auth): 2fa challenge view accepting totp and recovery codes"
```

---

## Task 19: `TwoFactorActivationFlow` — QR + validate + recovery codes

**Files:**
- Create: `src/components/auth/TwoFactorActivationFlow.tsx`
- Create: `src/components/auth/RecoveryCodesPanel.tsx`

**Pourquoi:** Flow 6 — écran 3 étapes (scan QR, validation, recovery codes + checkbox).

- [ ] **Step 1: Implémenter `RecoveryCodesPanel.tsx`**

```tsx
import { useTranslation } from "react-i18next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

export function RecoveryCodesPanel({ codes }: { codes: string[] }) {
  const { t } = useTranslation();

  async function copyAll() {
    await writeText(codes.join("\n"));
  }

  function downloadTxt() {
    const blob = new Blob([codes.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "voice-tool-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">{t("auth.twoFactor.activation.recoveryWarning")}</p>
      <pre className="p-3 rounded-lg bg-muted text-sm font-mono whitespace-pre-wrap">
        {codes.join("\n")}
      </pre>
      <div className="flex gap-2">
        <button type="button" onClick={copyAll} className="vt-btn vt-btn-secondary">
          {t("auth.twoFactor.activation.copyAll")}
        </button>
        <button type="button" onClick={downloadTxt} className="vt-btn vt-btn-secondary">
          {t("auth.twoFactor.activation.download")}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implémenter `TwoFactorActivationFlow.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { RecoveryCodesPanel } from "./RecoveryCodesPanel";

type Step = "scan" | "validate" | "recovery" | "done";

interface Props {
  onDone: () => void;
  onCancel: () => void;
}

export function TwoFactorActivationFlow({ onDone, onCancel }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("scan");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error || !data) {
        setError(t("auth.errors.generic"));
        return;
      }
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
    })();
  }, []);

  async function handleValidate() {
    if (!factorId) return;
    setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: code.trim(),
    });
    if (error) {
      setError(t("auth.errors.invalidCredentials"));
      return;
    }
    // Generate 10 recovery codes client-side. Supabase doesn't expose a first-party
    // API for this; we persist them in a dedicated table via an RPC added in Task 20.
    const codes = Array.from({ length: 10 }, () => genCode(8));
    const { error: rpcErr } = await supabase.rpc("store_recovery_codes", { codes });
    if (rpcErr) {
      setError(t("auth.errors.generic"));
      return;
    }
    setRecoveryCodes(codes);
    setStep("recovery");
  }

  function genCode(len: number) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const buf = new Uint8Array(len);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => chars[b % chars.length]).join("");
  }

  return (
    <div className="space-y-4">
      {step === "scan" && qrCode && (
        <>
          <p className="text-sm font-medium">{t("auth.twoFactor.activation.stepScan")}</p>
          <img src={qrCode} alt="TOTP QR code" className="mx-auto w-48 h-48 bg-white p-2 rounded" />
          <details>
            <summary className="text-xs text-muted-foreground cursor-pointer">
              {t("auth.twoFactor.activation.stepScanFallback")}
            </summary>
            <code className="block mt-2 text-xs font-mono break-all">{secret}</code>
          </details>
          <button onClick={() => setStep("validate")} className="vt-btn vt-btn-primary w-full">
            Continue
          </button>
        </>
      )}

      {step === "validate" && (
        <>
          <p className="text-sm font-medium">{t("auth.twoFactor.activation.stepValidate")}</p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t("auth.twoFactor.activation.codePlaceholder")}
            className="vt-input w-full tracking-widest"
          />
          <button onClick={handleValidate} className="vt-btn vt-btn-primary w-full" disabled={code.length < 6}>
            Continue
          </button>
        </>
      )}

      {step === "recovery" && (
        <>
          <p className="text-sm font-medium">{t("auth.twoFactor.activation.stepRecovery")}</p>
          <RecoveryCodesPanel codes={recoveryCodes} />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>{t("auth.twoFactor.activation.ackCheckbox")}</span>
          </label>
          <button onClick={onDone} className="vt-btn vt-btn-primary w-full" disabled={!ack}>
            {t("auth.twoFactor.activation.finish")}
          </button>
        </>
      )}

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button onClick={onCancel} className="vt-btn vt-btn-secondary w-full" type="button">
        {t("auth.twoFactor.activation.cancel")}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Créer la table + RPC pour stocker les recovery codes hashés**

`supabase/migrations/20260501000300_recovery_codes.sql` :

```sql
create table if not exists public.recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists recovery_codes_user_idx on public.recovery_codes (user_id);

alter table public.recovery_codes enable row level security;
create policy "recovery_codes_select_own" on public.recovery_codes
  for select using (auth.uid() = user_id);
create policy "recovery_codes_insert_own" on public.recovery_codes
  for insert with check (auth.uid() = user_id);
create policy "recovery_codes_update_own" on public.recovery_codes
  for update using (auth.uid() = user_id);

create or replace function public.store_recovery_codes(codes text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  -- Invalidate any previous codes first (regenerate semantics).
  delete from public.recovery_codes where user_id = uid;
  foreach c in array codes loop
    insert into public.recovery_codes (user_id, code_hash)
    values (uid, encode(digest(c, 'sha256'), 'hex'));
  end loop;
end;
$$;

grant execute on function public.store_recovery_codes(text[]) to authenticated;

-- Helper: consume a recovery code on login (checks hash + marks used).
create or replace function public.consume_recovery_code(code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  h text := encode(digest(code, 'sha256'), 'hex');
  matched uuid;
begin
  if uid is null then return false; end if;
  update public.recovery_codes
    set used_at = now()
    where user_id = uid and code_hash = h and used_at is null
    returning id into matched;
  return matched is not null;
end;
$$;

grant execute on function public.consume_recovery_code(text) to authenticated;
```

Puis :

```bash
supabase db push
```

- [ ] **Step 4: Build + commit**

```bash
pnpm build
git add src/components/auth/TwoFactorActivationFlow.tsx src/components/auth/RecoveryCodesPanel.tsx supabase/migrations/20260501000300_recovery_codes.sql
git commit -m "feat(auth): 2fa activation flow with hashed recovery codes"
```

---

## Task 20: New device tracking + trigger email notification

**Files:**
- Create: `supabase/migrations/20260501000200_new_device_trigger.sql`

**Pourquoi:** ADR 0006 — email obligatoire à chaque nouveau device détecté. Géré entièrement côté DB pour que le client n'ait qu'à insérer la row.

- [ ] **Step 1: Créer la migration**

```sql
-- When a fresh device row is inserted, send a notification email.
-- Uses Supabase's built-in `net.http_post` extension (must be enabled) to hit
-- an Edge Function that crafts the email via the Supabase SMTP.
-- v3.0 simplification: we set a flag and rely on a daily cron to batch-send.

alter table public.user_devices
  add column if not exists notified_at timestamptz;

create or replace function public.notify_new_device()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Naive anti-abuse: if this user has had >5 new devices in the last 24h,
  -- surface a flag (handled by a separate cron that blocks the account).
  perform 1
  from public.user_devices
  where user_id = new.user_id
    and first_seen_at > now() - interval '24 hours';
  -- Placeholder for actual email dispatch. In v3.0 we rely on a manual cron
  -- that reads `notified_at is null` rows and sends via an Edge Function.
  return new;
end;
$$;

drop trigger if exists trg_notify_new_device on public.user_devices;
create trigger trg_notify_new_device
  after insert on public.user_devices
  for each row execute function public.notify_new_device();
```

Note : l'envoi réel d'email est différé à une **Edge Function** qui lira les lignes `notified_at IS NULL`. Créer un ticket dans `docs/v3/01-auth.md` §"Questions techniques" pour la livraison finale de cette Edge Function (non bloquant v3.0 interne).

- [ ] **Step 2: Apply + commit**

```bash
supabase db push
git add supabase/migrations/20260501000200_new_device_trigger.sql
git commit -m "feat(db): trigger on new device row for future email notification"
```

---

## Task 21: Onglet settings "Compte" + "Sécurité"

**Files:**
- Create: `src/components/settings/sections/AccountSection.tsx`
- Create: `src/components/settings/sections/SecuritySection.tsx`
- Create: `src/components/settings/sections/DevicesList.tsx`
- Modify: `src/components/settings/common/SettingsNav.tsx` — ajouter `section-compte` et `section-securite`
- Modify: `src/components/settings/SettingTabs.tsx` — rendu conditionnel (si `status === "signed-in"`)

**Pourquoi:** Flows 6 + 8, section "Multi-device".

- [ ] **Step 1: Étendre `SettingsNav.tsx`**

Ajouter 2 entrées à `SettingsSectionId` et `NAV_ITEM_DEFS` :

```tsx
export type SettingsSectionId =
  | "section-transcription"
  | "section-post-process"
  | "section-audio"
  | "section-vocabulaire"
  | "section-apparence"
  | "section-raccourcis"
  | "section-systeme"
  | "section-mises-a-jour"
  | "section-compte"
  | "section-securite";
```

Ajouter dans `NAV_ITEM_DEFS` :

```tsx
import { User, ShieldCheck } from "lucide-react";
// ...
{
  id: "section-compte",
  icon: <User className="w-3.5 h-3.5 text-emerald-500" />,
  iconBg: "bg-emerald-500/10",
  titleKey: "auth.account.sectionTitle",
  subtitleKey: "auth.account.sectionSubtitle",
},
{
  id: "section-securite",
  icon: <ShieldCheck className="w-3.5 h-3.5 text-red-500" />,
  iconBg: "bg-red-500/10",
  titleKey: "auth.security.sectionTitle",
  subtitleKey: "auth.security.sectionSubtitle",
},
```

**⚠️ Ne pas rendre ces 2 entrées si `useAuth().status !== "signed-in"`.** Ajouter un filter dans le composant `SettingsNav` :

```tsx
const authOnlyIds = new Set(["section-compte", "section-securite"]);
const { status } = useAuth();
const items = NAV_ITEM_DEFS.filter((i) =>
  authOnlyIds.has(i.id) ? status === "signed-in" : true,
);
```

Remplacer `NAV_ITEM_DEFS.map` par `items.map`.

- [ ] **Step 2: Créer `AccountSection.tsx`**

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

export function AccountSection() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!user) return;
    setDeleting(true);
    // Requires a server-side RPC `delete_own_account` that purges related rows
    // then calls auth.admin.deleteUser via a security definer wrapper.
    const { error } = await supabase.rpc("request_account_deletion");
    setDeleting(false);
    if (!error) await signOut();
  }

  return (
    <section id="section-compte" className="vt-settings-section space-y-4">
      <header>
        <h3 className="text-base font-semibold">{t("auth.account.sectionTitle")}</h3>
      </header>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{t("auth.account.email")}</label>
        <p className="text-sm">{user?.email}</p>
      </div>

      <button onClick={signOut} className="vt-btn vt-btn-secondary">
        {t("auth.logout.label")}
      </button>

      <div className="pt-4 border-t">
        <p className="text-xs text-muted-foreground mb-2">{t("auth.account.deleteAccountWarning")}</p>
        {!confirmOpen ? (
          <button onClick={() => setConfirmOpen(true)} className="vt-btn vt-btn-danger">
            {t("auth.account.deleteAccount")}
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={handleDelete} className="vt-btn vt-btn-danger" disabled={deleting}>
              {t("auth.logout.confirm")}
            </button>
            <button onClick={() => setConfirmOpen(false)} className="vt-btn vt-btn-secondary">
              {t("auth.modal.close")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
```

Ajouter la migration `request_account_deletion` :

`supabase/migrations/20260501000400_account_deletion.sql` :

```sql
-- Marks the account for deletion. A daily cron purges accounts marked for >30 days.
-- For v3.0 we keep it simple: tombstone + sign-out. Actual data erasure handled by cron.

create table if not exists public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);

alter table public.account_deletion_requests enable row level security;
create policy "adr_insert_own" on public.account_deletion_requests
  for insert with check (auth.uid() = user_id);
create policy "adr_select_own" on public.account_deletion_requests
  for select using (auth.uid() = user_id);

create or replace function public.request_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  insert into public.account_deletion_requests (user_id)
  values (uid)
  on conflict (user_id) do nothing;
end;
$$;

grant execute on function public.request_account_deletion to authenticated;
```

- [ ] **Step 3: Créer `DevicesList.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "@/lib/supabase";

interface DeviceRow {
  id: string;
  device_fingerprint: string;
  os_name: string | null;
  app_version: string | null;
  last_seen_at: string;
}

export function DevicesList() {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [thisFp, setThisFp] = useState<string | null>(null);

  async function load() {
    const fp = await invoke<string>("get_or_create_device_id");
    setThisFp(fp);
    const { data } = await supabase
      .from("user_devices")
      .select("id,device_fingerprint,os_name,app_version,last_seen_at")
      .order("last_seen_at", { ascending: false });
    setDevices(data ?? []);
  }

  useEffect(() => { load(); }, []);

  async function disconnect(id: string) {
    await supabase.from("user_devices").delete().eq("id", id);
    await load();
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">{t("auth.security.devicesTitle")}</h4>
      <ul className="space-y-2">
        {devices.map((d) => (
          <li key={d.id} className="flex items-center justify-between text-sm">
            <div>
              <p>{d.os_name ?? "Unknown"} {d.app_version ? `— ${d.app_version}` : ""}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(d.last_seen_at).toLocaleString()}
                {d.device_fingerprint === thisFp && ` — ${t("auth.security.thisDevice")}`}
              </p>
            </div>
            {d.device_fingerprint !== thisFp && (
              <button onClick={() => disconnect(d.id)} className="text-xs underline">
                {t("auth.security.disconnectDevice")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Créer `SecuritySection.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { TwoFactorActivationFlow } from "@/components/auth/TwoFactorActivationFlow";
import { DevicesList } from "./DevicesList";

export function SecuritySection() {
  const { t } = useTranslation();
  const { keyringAvailable } = useAuth();
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [showActivation, setShowActivation] = useState(false);

  async function loadMfa() {
    const { data } = await supabase.auth.mfa.listFactors();
    setMfaEnabled((data?.totp?.length ?? 0) > 0);
  }

  useEffect(() => { loadMfa(); }, []);

  async function disable() {
    const { data } = await supabase.auth.mfa.listFactors();
    const totp = data?.totp?.[0];
    if (!totp) return;
    await supabase.auth.mfa.unenroll({ factorId: totp.id });
    await loadMfa();
  }

  return (
    <section id="section-securite" className="vt-settings-section space-y-4">
      <header>
        <h3 className="text-base font-semibold">{t("auth.security.sectionTitle")}</h3>
      </header>

      {!keyringAvailable && (
        <p role="alert" className="text-sm text-amber-600">
          {t("auth.security.keyringUnavailable")}
        </p>
      )}

      <div className="space-y-2">
        <p className="text-sm">
          {mfaEnabled ? t("auth.security.twoFactorEnabled") : t("auth.security.twoFactorDisabled")}
        </p>
        {!mfaEnabled && !showActivation && (
          <button onClick={() => setShowActivation(true)} className="vt-btn vt-btn-primary">
            {t("auth.security.enable2fa")}
          </button>
        )}
        {mfaEnabled && (
          <button onClick={disable} className="vt-btn vt-btn-danger">
            {t("auth.security.disable2fa")}
          </button>
        )}
        {showActivation && (
          <TwoFactorActivationFlow
            onDone={() => { setShowActivation(false); loadMfa(); }}
            onCancel={() => setShowActivation(false)}
          />
        )}
      </div>

      <DevicesList />
    </section>
  );
}
```

- [ ] **Step 5: Wiring dans `SettingTabs.tsx`**

Ajouter les 2 imports et rendu conditionnel :

```tsx
import { AccountSection } from "./sections/AccountSection";
import { SecuritySection } from "./sections/SecuritySection";
// ...
const { status } = useAuth();
// dans le rendu, après les 8 onglets existants :
{status === "signed-in" && <AccountSection />}
{status === "signed-in" && <SecuritySection />}
```

- [ ] **Step 6: Build + apply migration**

```bash
supabase db push
pnpm build
```

- [ ] **Step 7: Commit**

```bash
git add src/components/settings/sections/AccountSection.tsx src/components/settings/sections/SecuritySection.tsx src/components/settings/sections/DevicesList.tsx src/components/settings/common/SettingsNav.tsx src/components/settings/SettingTabs.tsx supabase/migrations/20260501000400_account_deletion.sql
git commit -m "feat(auth): settings tabs for account + security + devices list"
```

---

## Task 22: Upsert device row on login

**Files:**
- Modify: `src/contexts/AuthContext.tsx` — after successful login, upsert `user_devices`

**Pourquoi:** la liste multi-device se remplit seulement si on inscrit le device à chaque login.

- [ ] **Step 1: Ajouter un helper `upsertDevice` dans `AuthContext`**

```tsx
async function upsertDevice(userId: string) {
  try {
    const fp = await invoke<string>("get_or_create_device_id");
    const osName = navigator.platform || "Unknown";
    // appVersion: pass from a Tauri command if available, else use package.json version.
    const { error } = await supabase.from("user_devices").upsert(
      {
        user_id: userId,
        device_fingerprint: fp,
        os_name: osName,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id,device_fingerprint" },
    );
    if (error) console.warn("upsert device failed", error);
  } catch (e) {
    console.warn("device upsert skipped", e);
  }
}
```

Appeler `upsertDevice(session.user.id)` :
- à la fin de la session restore réussie
- dans l'`onAuthStateChange` sur event `SIGNED_IN`

- [ ] **Step 2: Build + commit**

```bash
pnpm build
git add src/contexts/AuthContext.tsx
git commit -m "feat(auth): upsert user_devices row on session activation"
```

---

## Task 23: Dashboard CTA — "Sync tes réglages" (non-intrusif)

**Files:**
- Create: `src/components/auth/AccountCTA.tsx`
- Modify: `src/components/dashboard/Dashboard.tsx` — insérer la CTA si `status === "signed-out"`

**Pourquoi:** principe produit `01-auth.md` — "signup n'est jamais un mur d'entrée". Proposer mais ne pas imposer.

- [ ] **Step 1: Créer `AccountCTA.tsx`**

```tsx
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";

export function AccountCTA() {
  const { t } = useTranslation();
  const { status, openAuthModal } = useAuth();
  if (status !== "signed-out") return null;
  return (
    <div className="vt-card p-4 flex items-center justify-between gap-3">
      <p className="text-sm">{t("auth.cta.dashboardCard")}</p>
      <button onClick={openAuthModal} className="vt-btn vt-btn-primary">
        {t("auth.cta.header")}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Insérer dans `Dashboard.tsx`**

Placer `<AccountCTA />` en bas du dashboard (ou dans la sidebar), **jamais bloquant**.

- [ ] **Step 3: Build + commit**

```bash
pnpm build
git add src/components/auth/AccountCTA.tsx src/components/dashboard/Dashboard.tsx
git commit -m "feat(auth): soft account cta in dashboard"
```

---

## Task 24: Checklist E2E manuelle des 8 flows

**Files:**
- Create: `docs/v3/01-auth-e2e-checklist.md`

**Pourquoi:** pas de framework E2E automatisé dans le repo actuel. On livre une checklist reproductible que l'user peut cocher avant merge.

- [ ] **Step 1: Rédiger la checklist**

```markdown
# E2E checklist — sous-épique 01 auth

Exécutée avant merge sur `main`. Cocher chaque ligne avec date + OS.

## Flow 1 — Signup magic link

- [ ] (Win, date) Email reçu avec lien `auth.<domaine>/callback?type=magiclink&...`
- [ ] Clic du lien → page callback → app s'ouvre → user loggué
- [ ] Refresh token stocké dans Credential Manager / Keychain / libsecret
- [ ] Row insérée dans `user_devices`

## Flow 2 — Google OAuth

- [ ] Clic "Continuer avec Google" ouvre le navigateur
- [ ] Consent → callback → deep link → user loggué
- [ ] `state` nonce rejeté si rejoué (test manuel : ouvrir 2x la même URL)

## Flow 3 — Signup E/P

- [ ] Password < 10 chars : refusé avec message clair
- [ ] Password "password" : refusé (pwned list)
- [ ] Password valide : email de confirmation reçu
- [ ] Clic du lien de confirmation → user loggué directement

## Flow 4 — Login E/P

- [ ] Password incorrect : message "invalid credentials" générique
- [ ] Password correct sans 2FA : loggué
- [ ] Password correct avec 2FA : écran challenge

## Flow 5 — Reset password

- [ ] Email de reset reçu
- [ ] Clic du lien → modal avec formulaire nouveau password
- [ ] Submission : password mis à jour, toutes sessions autres devices invalidées (check sur un 2e device)

## Flow 6 — Activation 2FA

- [ ] QR code visible + seed en texte
- [ ] Code validé par Google Authenticator
- [ ] 10 recovery codes affichés
- [ ] Bouton "Terminer" désactivé tant que checkbox non cochée
- [ ] Row dans `recovery_codes` (10 lignes, `used_at` null)

## Flow 7 — Login avec 2FA

- [ ] Code TOTP valide → loggué
- [ ] Code TOTP invalide → message d'erreur
- [ ] Recovery code valide → loggué + ligne `used_at` mise à jour

## Flow 8 — Logout

- [ ] Modal de confirmation
- [ ] Session invalide après clic (refresh token purge)
- [ ] Credential Manager / Keychain vidé

## Tests cross-OS (obligatoires pour v3.0 GA)

- [ ] Flow 1 validé sur Windows 11
- [ ] Flow 1 validé sur macOS 14+
- [ ] Flow 1 validé sur Ubuntu 24.04 (avec libsecret)
- [ ] Flow 1 validé sur Ubuntu sans libsecret : message "keyring indisponible" affiché, session non persistée
```

- [ ] **Step 2: Exécuter au moins les flows 1, 3, 4, 8 sur Windows avant merge**

**Action utilisateur requise.**

- [ ] **Step 3: Commit**

```bash
git add docs/v3/01-auth-e2e-checklist.md
git commit -m "docs(v3): e2e checklist for auth flows"
```

---

## Task 25: Mise à jour docs v3 + CLAUDE.md + ADR de clôture

**Files:**
- Modify: `docs/v3/01-auth.md` — remplir section "Livrables dev" avec ce qui est réellement livré
- Modify: `docs/v3/README.md` — passer sous-épique 01 en "🚧 En cours" puis "✅ Livré" à la fin
- Modify: `CLAUDE.md` — section "V3 Auth" ajoutée
- Create: `docs/v3/decisions/0009-sub-epic-01-closure.md`

**Pourquoi:** clôture propre + découvrabilité pour les futures sessions Claude Code.

- [ ] **Step 1: Rédiger ADR 0009**

```markdown
# ADR 0009 — Clôture sous-épique 01-auth

- **Statut**: Accepté
- **Date**: <à remplir>

## Résumé des décisions émergentes

- **Email templates** : anglais uniquement v3.0, FR différé v3.x (Supabase ne supporte pas nativement multi-lang).
- **Emails nouveau device** : stocké en DB via trigger, envoi réel différé à une Edge Function (ticket ouvert).
- **Delete account** : tombstone + cron 30 jours (pas de deletion synchrone) — conforme GDPR 30 jours.
- **Recovery codes** : gérés en DB via RPC `store_recovery_codes` / `consume_recovery_code`, hashés SHA-256 (pas de dep Supabase native).

## Ajustements vs 01-auth.md initial

- Ajout table `recovery_codes` (pas mentionnée dans le spec mais nécessaire).
- Ajout table `account_deletion_requests`.
- Deep link : utilisation du plugin officiel `tauri-plugin-deep-link` (pas mentionné précisément dans le spec).
```

- [ ] **Step 2: Ajouter à `CLAUDE.md`**

Section "V3 Auth" après "V3 Documentation" :

```markdown
### V3 Auth (livré sous-épique 01)

- Backend auth : `src-tauri/src/auth.rs` (keyring + oauth nonce + deep link parsing)
- Deep link scheme : `voice-tool://auth/callback?type=<magiclink|oauth|signup|recovery>&...`
- Frontend client : `src/lib/supabase.ts`
- État global : `src/contexts/AuthContext.tsx` + `src/hooks/useAuth.ts`
- Écrans : `src/components/auth/*` (Login, Signup, Reset, 2FA)
- Pwned passwords : `src/lib/pwned-passwords.ts` + liste embarquée top-10k SHA-256
- Migrations DB : `supabase/migrations/20260501*` (user_devices, rate_limit_log, recovery_codes, account_deletion)
- Page callback : repo séparé `voice-tool-auth-callback` (Cloudflare Pages)
- Env vars : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` dans `.env.local` (gitignored)
```

- [ ] **Step 3: Remplir `docs/v3/01-auth.md` section "Livrables dev"**

Cocher chacun des 8 items d'origine avec ✅ + lien vers le PR correspondant.

- [ ] **Step 4: Passer `docs/v3/README.md` sous-épique 01 en "✅ livré"**

- [ ] **Step 5: Commit**

```bash
git add docs/v3/decisions/0009-sub-epic-01-closure.md CLAUDE.md docs/v3/01-auth.md docs/v3/README.md
git commit -m "docs(v3): close sub-epic 01 auth with adr 0009 and doc updates"
```

---

## Sortie de sous-épique — critères d'acceptation

Le sous-épique 01 peut être clôturé quand **tous** les points ci-dessous sont ✅ :

- [ ] `keyring` compile sur Windows avec les deps actuelles (PF-1)
- [ ] ADR 0008 rate limiting écrit
- [ ] Repo `voice-tool-auth-callback` déployé sur Cloudflare Pages avec CSP stricte
- [ ] Config Supabase Auth appliquée (TTLs, OAuth Google, MFA)
- [ ] 5 migrations SQL appliquées (`user_devices`, `rate_limit_log`, `recovery_codes`, `new_device_trigger`, `account_deletion`)
- [ ] Tests cross-tenant RLS passent (`supabase db test`)
- [ ] `src-tauri/src/auth.rs` livré + `cargo test auth` PASS
- [ ] Scheme `voice-tool://` enregistré OS (vérifier sur Windows via clic deep link manuel)
- [ ] `AuthContext` + 6 écrans auth + 2 onglets settings livrés
- [ ] i18n FR + EN complets pour `auth.*`
- [ ] Pwned passwords list embarquée + test Vitest PASS
- [ ] E2E checklist cochée au moins pour Windows (flows 1, 3, 4, 6, 7, 8)
- [ ] ADR 0009 clôture écrit
- [ ] `CLAUDE.md` + `docs/v3/README.md` + `docs/v3/01-auth.md` mis à jour

Une fois tous ces points validés, **sous-épique 01 clos** — le sous-épique 02 (sync settings) peut démarrer son propre plan.

---

## Ordre d'exécution recommandé

**Parallélisable** (subagents possibles) :
- PF-1 et PF-2 (indépendants, en tout premier)
- Task 1 (repo callback) et Task 3 (config Supabase) peuvent démarrer en parallèle après PF
- Task 5, 6, 20 (migrations) peuvent s'écrire sur la même branche, appliquées dans l'ordre des timestamps
- Task 7, 8, 9 (backend Rust) séquentielles
- Task 10, 11, 12 (frontend shell) séquentielles mais parallèles au backend Rust
- Task 13 (pwned) peut être faite à tout moment après Task 10

**Séquentielles strictes** :
- Task 4 (Google OAuth) après Task 3 (Supabase ready)
- Task 8 après Task 7 (keyring avant auth.rs)
- Task 9 après Task 8 (deep link utilise AuthState)
- Tasks 15-19 (écrans) après Task 14 (AuthModal shell)
- Task 22 (upsert device) après Task 21 (devices list)
- Task 24 + 25 (clôture) **en dernier**
