# Email templates — Supabase Auth (phase 1, 3 templates)

**Date** : 2026-05-02
**Branche cible** : `feat/email-templates`
**Statut** : design approuvé, prêt à être planifié
**Phase** : 1 sur 2 — couvre les 3 templates servis par Supabase Auth (magic link, signup confirmation, password reset). Phase 2 (4 templates Resend via Edge Functions : welcome, new-device, deletion request, deletion completion) fera l'objet d'un spec séparé.

---

## 1. Contexte et problème

Les emails transactionnels actuellement envoyés aux utilisateurs Lexena se répartissent en deux familles :

1. **Emails servis par Supabase Auth** (magic link, signup confirmation, password reset) — actuellement les templates **par défaut Supabase**, génériques, sans identité visuelle Lexena. Ce sont les premiers emails que reçoit un nouvel utilisateur, et l'impression initiale est mauvaise : pas de logo, copie générique, ne reflète pas le ton sobre/pro de Lexena.

2. **Emails envoyés via Edge Functions Resend** — actuellement une seule fonction (`send-new-device-email`) qui envoie en **plain text uniquement**, sans HTML.

Le doc `docs/v3/legal/email-templates.md` liste 7 templates rédigés en plain text (FR + EN miroir), mais aucun n'est implémenté en HTML stylé.

L'épique v3 se prépare à un launch "Public Beta" avec ouverture publique. Les emails transactionnels doivent au minimum (a) inspirer confiance pour les flows de sécurité (magic link, reset password) et (b) refléter l'identité visuelle Lexena déjà déployée dans l'app (`#1D9E75` Signal Green, `#0D1B2A` navy, monogramme).

Ce spec couvre la **phase 1** : les 3 templates Supabase Auth. Une phase 2 réutilisera l'infra mise en place ici pour traiter les 4 emails Resend.

## 2. Décisions de design

| # | Sujet | Décision |
|---|---|---|
| Q1 | Outillage | **React Email** (`@react-email/components`, `@react-email/render`) |
| Q2 | Direction visuelle | **Sobre + accent navy** : header navy plein, body blanc, CTA Signal Green |
| Q3 | Langue | **EN uniquement** pour la v3.0 (cible internationale). FR via override hook plus tard. |
| Q4 | Logo | **Monogramme PNG via GitHub raw** (`src-tauri/icons/monogram-512.png`) — placeholder temporaire, à migrer dès que le site marketing héberge un asset propre OU dès que le nouveau monogramme est disponible |
| Q5 | Largeur | 600px container, 560px carte intérieure (standard email) |
| Q6 | Police | **Inter** via Google Fonts `<link>` + fallback `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif` |
| Q7 | Localisation des fichiers | Dossier `emails/` à la racine, sous-projet React Email autonome |
| Q8 | Versionnement du HTML compilé | Commit dans `dist/emails/` pour traçabilité et diffs visuels entre releases |
| Q9 | Variables Liquid Supabase | Écrites comme strings brutes `{{ .ConfirmationURL }}` dans les `.tsx`, vérification post-build qu'elles ne sont pas échappées |
| Q10 | Dark mode | Pas de support explicite — couleurs choisies pour rester lisibles si Gmail/Apple Mail auto-inverse |

## 3. Architecture

### 3.1 Layout des fichiers

```
emails/                                  ← nouveau, racine du repo
├── package.json                         ← scripts email:dev, email:build
├── tsconfig.json
├── components/
│   ├── EmailLayout.tsx                  ← Html, Head, Body, Container + Google Fonts
│   ├── EmailHeader.tsx                  ← header navy + monogramme
│   ├── EmailFooter.tsx                  ← footer "Lexena · lexena.app"
│   ├── EmailButton.tsx                  ← CTA Signal Green
│   ├── EmailHeading.tsx                 ← H1 stylé
│   ├── EmailText.tsx                    ← paragraphe stylé
│   ├── EmailSecurityNote.tsx            ← encadré sécu border-left vert
│   └── tokens.ts                        ← couleurs, espacements, polices
├── templates/
│   ├── MagicLink.tsx
│   ├── SignupConfirmation.tsx
│   └── PasswordReset.tsx
├── build.ts                             ← script Node : render() chaque template → dist/
└── README.md                            ← procédure d'édition + déploiement Supabase

dist/emails/                             ← HTML compilés, commités
├── magic-link.html
├── signup-confirmation.html
└── password-reset.html
```

### 3.2 Pipeline de rendu

```
emails/templates/MagicLink.tsx
            │
            │  pnpm email:build
            ▼
   render() de @react-email/render
            │
            ▼
dist/emails/magic-link.html  ← contient {{ .ConfirmationURL }} non échappé
            │
            │  copie manuelle
            ▼
Supabase Dashboard → Auth → Email Templates → Magic Link
            │
            │  user clique sur "Recevoir un lien"
            ▼
Supabase substitue {{ .ConfirmationURL }} → URL réelle
            │
            ▼
       Email envoyé
```

Le rendu n'est **pas dynamique côté serveur** : on builde une fois en local, on copie-colle dans Supabase, c'est figé tant qu'on ne ré-édite pas le `.tsx`.

### 3.3 Workflow d'édition

```
1. Modifier emails/templates/MagicLink.tsx
2. pnpm email:dev  → preview live sur localhost:3000
3. pnpm email:build → écrit dist/emails/magic-link.html
4. git diff dist/emails/  → revue du HTML compilé
5. git commit
6. Manuellement : copier dist/emails/magic-link.html dans Supabase Dashboard
7. Test "Send test email" depuis Supabase
```

## 4. Design visuel

### 4.1 Layout commun

```
┌─────────────────────────────────────────┐  ← fond extérieur #F6F6F7, padding 32px haut/bas
│                                         │
│  ┌───────────────────────────────────┐  │  ← carte 560px, fond blanc, radius 12px,
│  │                                   │  │     ombre légère 0 1px 3px rgba(0,0,0,0.05)
│  │   ████ HEADER NAVY ████          │  │
│  │   #0D1B2A, padding 32px           │  │  ← monogramme PNG 56×56, centré
│  │       [monogram 56×56]            │  │
│  │   ████████████████████            │  │
│  │                                   │  │
│  │   [BODY blanc, padding 40px h /   │  │
│  │    32px v]                        │  │
│  │                                   │  │
│  │   H1  24px / 600 / #0D1B2A        │  │
│  │                                   │  │
│  │   P 16px / 400 / #374151 / 1.6   │  │
│  │                                   │  │
│  │   ┌─────────────────┐             │  │  ← CTA: bg #1D9E75, padding 14px 28px,
│  │   │  CTA TEXT       │             │  │     radius 8px, color #fff, weight 500
│  │   └─────────────────┘             │  │
│  │                                   │  │
│  │   P_secondary 14px / #6B7280     │  │  ← durée du lien
│  │                                   │  │
│  │   ╭─ encadré sécu ──────╮         │  │  ← bg #F3F4F6, border-left 3px #1D9E75,
│  │   │ texte 14px italique │         │  │     padding 16px, radius 6px
│  │   ╰─────────────────────╯         │  │
│  │                                   │  │
│  │   "— The Lexena team"             │  │  ← 14px / #6B7280
│  │                                   │  │
│  │   ─── separator ───                │  │
│  │                                   │  │
│  │   FOOTER 12px / #6B7280           │  │
│  │   "Lexena · lexena.app"           │  │
│  │   "You received this email        │  │
│  │    because of an action on        │  │
│  │    your account."                 │  │
│  └───────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

### 4.2 Tokens (`emails/components/tokens.ts`)

```ts
export const colors = {
  navy: "#0D1B2A",
  signalGreen: "#1D9E75",
  bg: "#F6F6F7",          // fond extérieur
  card: "#FFFFFF",         // fond carte
  text: "#374151",         // corps
  textMuted: "#6B7280",    // footer, durée du lien
  border: "#E5E7EB",
  noteBg: "#F3F4F6",
};

export const fontStack =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
```

### 4.3 Logo placeholder

URL : `https://raw.githubusercontent.com/Nolyo/voice-tool/main/src-tauri/icons/monogram-512.png`

Affiché en `width="56" height="56"` via `<Img>` de React Email.

**À remplacer** :
- Quand le nouveau monogramme arrive (changement design en cours)
- Quand le site marketing `lexena.app` héberge un asset stable type `lexena.app/static/email/monogram@2x.png`

L'URL est centralisée dans `emails/components/tokens.ts` pour migration en un seul endroit.

## 5. Contenus des templates (EN)

### 5.1 Magic Link

- **Subject** : `Sign in to Lexena`
- **H1** : `Sign in to Lexena`
- **Body** : "Click the button below to sign in to your account."
- **CTA** : `Sign in` → `{{ .ConfirmationURL }}`
- **Sous-CTA** : "This link is valid for 1 hour and can only be used once."
- **Note de sécurité** : "Didn't request this sign-in? You can safely ignore this message — your account remains secure."
- **Signature** : "— The Lexena team"

### 5.2 Signup Confirmation

- **Subject** : `Confirm your Lexena email address`
- **H1** : `Welcome to Lexena`
- **Body** : "To finalize your account creation, please confirm your email address."
- **CTA** : `Confirm my email` → `{{ .ConfirmationURL }}`
- **Sous-CTA** : "This link is valid for 24 hours."
- **Note de sécurité** : "Didn't create a Lexena account? You can safely ignore this message."
- **Signature** : "— The Lexena team"

### 5.3 Password Reset

- **Subject** : `Reset your Lexena password`
- **H1** : `Reset your password`
- **Body** : "Click the button below to choose a new password."
- **CTA** : `Reset password` → `{{ .ConfirmationURL }}`
- **Sous-CTA** : "This link is valid for 1 hour and can only be used once."
- **Note de sécurité** : "If you didn't request this, ignore this message — your current password remains valid. On the next successful login after reset, all your active sessions on other devices will be revoked."
- **Signature** : "— The Lexena team"

## 6. Plan d'implémentation

### Étape 1 — Setup React Email (~30 min)

- Créer `emails/` avec son propre `package.json` (workspace pnpm OU sous-projet indépendant — à choisir lors de la planification fine)
- Installer `@react-email/components`, `@react-email/render`, `react-email` (CLI dev preview), `tsx` (runner TypeScript pour `build.ts`)
- Ajouter `tsconfig.json` avec resolution Node + JSX React
- Ajouter scripts au `package.json` racine :
  - `email:dev` → délègue à `cd emails && react-email dev`
  - `email:build` → délègue à `cd emails && tsx build.ts`
- Vérifier que `pnpm email:dev` ouvre `localhost:3000` avec liste des templates

### Étape 2 — Tokens et composants partagés (~1h)

- `emails/components/tokens.ts` : couleurs, fontStack, URL logo
- `EmailLayout.tsx` : structure `<Html><Head><Preview><Body><Container>` avec Google Fonts `<link>` Inter + fallback CSS
- `EmailHeader.tsx` : section navy 32px padding, `<Img src={tokens.logoUrl} width="56" height="56" />`
- `EmailButton.tsx` : `<Button>` React Email avec styles tokens
- `EmailHeading.tsx`, `EmailText.tsx`, `EmailSecurityNote.tsx`
- `EmailFooter.tsx` : "Lexena · lexena.app" + ligne contextuelle paramétrable

### Étape 3 — 3 templates (~1h30)

- `MagicLink.tsx`, `SignupConfirmation.tsx`, `PasswordReset.tsx`
- Chacun assemble les composants partagés avec le contenu EN défini section 5
- Variables Supabase Liquid `{{ .ConfirmationURL }}` écrites comme strings brutes dans les props `href`
- Preview de chaque template dans `pnpm email:dev`, vérification visuelle desktop + mobile (responsive width)

### Étape 4 — Build script (~30 min)

- `emails/build.ts` : importe chaque template, appelle `render()`, écrit dans `../dist/emails/{slug}.html`
- Vérification post-build : grep des occurrences `{{ .ConfirmationURL }}` dans le HTML produit (doit être ≥ 1 par fichier, **non échappé**)
- Si React échappe en `&#123;&#123; .ConfirmationURL &#125;&#125;`, post-traitement string-replace dans `build.ts` pour restaurer les `{{ }}`
- `pnpm email:build` → 3 fichiers HTML dans `dist/emails/`

### Étape 5 — Tests automatisés (~1h)

- **Snapshot test** (vitest, dans `emails/__tests__/build.test.ts`) :
  - Lance le build
  - Compare chaque HTML produit à un snapshot commité
  - Fail si les `.tsx` modifient le HTML sans rebuild des snapshots
- **Lint check** : test custom qui vérifie que chaque HTML contient `{{ .ConfirmationURL }}` (pas échappé) et un `<a>` valide pointant dessus

### Étape 6 — Tests de compatibilité multi-clients (~1h)

- Ouvrir chaque HTML compilé dans Chrome localement → validation visuelle
- **Litmus** ou **Email on Acid** (free trial 7 jours) → previews :
  - Gmail (web, iOS, Android)
  - Outlook (desktop Win, web)
  - Apple Mail (macOS, iOS)
  - Yahoo, ProtonMail (bonus)
- Vérifier dark mode auto-invert Gmail iOS
- Si rendu cassé sur un client majeur → ajustements (table-based si Outlook, etc.)

### Étape 7 — Intégration Supabase Auth (~15 min)

- Pour chacun des 3 templates :
  - Dashboard Supabase → Authentication → Email Templates → sélectionner le template
  - Remplacer le contenu HTML par celui de `dist/emails/{slug}.html`
  - Modifier le subject correspondant
  - "Send test email" → réception dans la boîte de l'opérateur
  - Vérification visuelle finale dans le client mail réel

### Étape 8 — Documentation (~30 min)

- Mettre à jour `docs/v3/legal/email-templates.md` :
  - Ajouter une note en tête : "EN-only pour v3.0 ; `emails/templates/*.tsx` est la source de vérité"
  - Marquer les sections FR comme "à venir post-launch via locale hook"
- Ajouter section "Email templates" au `CLAUDE.md` :
  - Pointer vers `emails/README.md`
  - Procédure d'édition + déploiement Supabase
- Créer `emails/README.md` :
  - Explication du pipeline
  - Comment ajouter un nouveau template (préparation phase 2)
  - Procédure de copie vers Supabase

### Charge totale estimée

~5h de travail effectif, à répartir en 1-2 sessions.

## 7. Tests

### 7.1 Tests automatisés

- `emails/__tests__/build.test.ts` (vitest) :
  - Lance `build()` → produit du HTML attendu
  - Snapshot test sur chaque fichier HTML
  - Vérifie présence de `{{ .ConfirmationURL }}` non échappé
  - Vérifie présence du subject (commenté en début de fichier ou exporté séparément)

### 7.2 Tests manuels (checklist post-implémentation)

- [ ] `pnpm email:dev` ouvre la preview, les 3 templates s'affichent
- [ ] `pnpm email:build` produit 3 fichiers HTML cohérents
- [ ] Chaque HTML contient `{{ .ConfirmationURL }}` non échappé
- [ ] Rendu Gmail web (compte test) ✓
- [ ] Rendu Gmail iOS (mode clair + dark) ✓
- [ ] Rendu Outlook desktop (Windows) ✓
- [ ] Rendu Apple Mail iOS ✓
- [ ] Bouton CTA cliquable et navigue vers la bonne URL après substitution Supabase
- [ ] Logo s'affiche (image GitHub raw chargée)
- [ ] "Send test email" dans Supabase → réception OK pour les 3 templates

## 8. Risques et mitigations

| # | Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|---|
| R1 | React Email échappe `{` `}` dans les attributs `href` | Moyenne | Élevé (templates inutilisables) | Détection au build (grep), post-traitement string-replace dans `build.ts` si besoin |
| R2 | Inter via Google Fonts non chargé sur Outlook desktop | Certaine | Faible | Fallback `-apple-system, Segoe UI` déjà prévu — Outlook utilisera Segoe UI, très proche d'Inter |
| R3 | Image GitHub raw rate-limited à grande échelle | Faible (Public Beta) | Moyen | 5000 req/h gratuites suffisent largement. Issue de suivi pour migrer dès site marketing |
| R4 | `dist/emails/` désync du `.tsx` (oubli de rebuild) | Moyenne | Moyen | Snapshot test CI rebuild + compare → fail si désync |
| R5 | CSS non supporté par Outlook (flexbox, grid) | Élevée si non géré | Élevé | React Email utilise par défaut des `<table>` et CSS inline → mitigé par l'outil. Validation manuelle via Litmus en étape 6 |
| R6 | Logo monogramme actuel obsolète au moment du déploiement | Élevée (changement annoncé) | Faible | URL centralisée dans `tokens.ts` → migration en un point |

## 9. Out of scope explicite (Phase 2, autre spec)

- Les 4 autres emails via Edge Functions Resend :
  - Welcome (post-signup)
  - New device alert (refonte HTML de `send-new-device-email`)
  - Account deletion request
  - Account deletion completion
- Localisation FR/EN par préférence user (hook `auth-email-hook` qui lit `user_settings.ui_language`)
- Migration vers asset hébergé sur `lexena.app/static/email/...` (dépend du site marketing)
- Configuration SMTP custom Resend dans Supabase Auth (déjà partiellement en place pour `send-new-device-email`)
- Tests de deliverability poussés (DMARC/BIMI/SPF) — déjà tracés dans `docs/v3/runbooks/`
- Logo wordmark "lexena" complet (pas seulement le monogramme) — décidé après livraison du site marketing

## 10. Décisions structurelles à confirmer en planification fine

Ces points sont laissés au plan d'implémentation pour décision finale, car ils n'impactent pas le design fonctionnel :

- `emails/` en **workspace pnpm** ou **sous-projet indépendant** (`pnpm install` à part) ?
- Variable `RESEND_API_KEY` ou autre secret nécessaire à ce stade ? (a priori **non**, Supabase Auth gère lui-même l'envoi tant qu'on n'a pas migré au SMTP custom)
