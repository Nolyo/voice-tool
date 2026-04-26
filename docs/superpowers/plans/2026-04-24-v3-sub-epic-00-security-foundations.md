# V3 Sub-Epic 00 — Security Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer les fondations sécurité & GDPR de la v3.0 (comptes ops durcis, CI audit bloquant, scanner anti-leak de service role key, runbooks, registre GDPR, projet Supabase EU + Cloudflare Pages initialisés) **sans toucher au code applicatif**.

**Architecture:** Trois chantiers parallèles :
1. **Ops** (comptes externes, hors code) — création Supabase Pro EU, Cloudflare Pages, 2FA sur tous les comptes ops, DPA Supabase signé, backups chiffrés configurés.
2. **CI** (GitHub Actions, nouveaux workflows sous `.github/workflows/`) — `pnpm audit` et `cargo audit` bloquants sur HIGH/CRITICAL, scanner regex qui casse le build si une clé `sb_secret_*` ou JWT Supabase apparaît dans les bundles frontend ou le binaire Tauri.
3. **Docs** (`docs/v3/runbooks/`, `docs/v3/compliance/`, `docs/v3/ops/`) — runbooks rotation secrets / backup-restore / incident response, registre des traitements GDPR, base légale, checklist comptes ops.

**Tech Stack:** GitHub Actions YAML, `cargo audit` (crate `cargo-audit`), `pnpm audit` (natif), Node script Node.js pour scanner regex, Markdown pour docs. Aucun changement dans `src/`, `src-tauri/src/`, `app/`.

**Related spec:** [`docs/v3/00-threat-model.md`](../../v3/00-threat-model.md) (figé 2026-04-22), [`docs/v3/decisions/0006-threat-model.md`](../../v3/decisions/0006-threat-model.md), [`docs/v3/decisions/0007-auth-configuration.md`](../../v3/decisions/0007-auth-configuration.md).

**Build verification:** Le projet n'a pas de suite de tests. Pour la CI : valider localement les workflows via `act` si installé, sinon pousser sur une branche jetable et vérifier que le job passe/échoue comme attendu. Pour les docs : relecture manuelle avant commit, pas de test automatique.

**Scope exclu** (hors ce plan) :
- SECURITY.md (déjà livré — `SECURITY.md:1-75`)
- Création du schéma DB, RLS, policies Supabase (→ sous-épique 02)
- Configuration du provider Auth, magic link, OAuth (→ sous-épique 01)
- Contenu privacy policy / mentions légales publiques (→ sous-épique 06, dépend du domaine)
- Customisation emails Supabase (→ sous-épique 01)

---

## File Structure

### Files created

**CI**
- `.github/workflows/security-audit.yml` — job pnpm audit + cargo audit quotidien + sur PR (Task 2, 3)
- `.github/scripts/scan-secrets-in-bundles.mjs` — scanner regex anti-leak de secrets (Task 4)
- `.github/workflows/secret-scan.yml` — workflow qui appelle le scanner après chaque build release (Task 4)

**Runbooks** (`docs/v3/runbooks/`)
- `docs/v3/runbooks/README.md` — index des runbooks (Task 5)
- `docs/v3/runbooks/secrets-rotation.md` — rotation JWT secret, webhook LS, service role key, clé updater (Task 9)
- `docs/v3/runbooks/backup-restore-test.md` — test trimestriel de restauration Supabase (Task 10)
- `docs/v3/runbooks/incident-response.md` — plan incident + notification GDPR <72h (Task 11)

**Compliance GDPR** (`docs/v3/compliance/`)
- `docs/v3/compliance/README.md` — index compliance (Task 5)
- `docs/v3/compliance/registre-traitements.md` — registre GDPR (Task 12)
- `docs/v3/compliance/base-legale.md` — base légale par traitement (Task 13)

**Ops** (`docs/v3/ops/`)
- `docs/v3/ops/README.md` — index ops (Task 5)
- `docs/v3/ops/accounts-checklist.md` — checklist 2FA tous comptes ops (Task 1)
- `docs/v3/ops/supabase-bootstrap.md` — procédure création projet Supabase EU Pro (Task 6)
- `docs/v3/ops/cloudflare-pages-bootstrap.md` — procédure création projet Cloudflare Pages (Task 8)

### Files modified

- `docs/v3/README.md` — mise à jour statut sous-épique 00 + ajout liens `runbooks/`, `compliance/`, `ops/` (Task 14)
- `docs/v3/00-threat-model.md` — mise à jour section "Livrables" pour refléter ce qui est produit par ce plan (Task 14)

### Files NOT touched

Aucun fichier sous `src/`, `src-tauri/src/`, `app/`, ou `scripts/`. Aucune dépendance `package.json` / `Cargo.toml` ajoutée (on utilise ce qui existe déjà + actions GitHub officielles).

---

## Task 1: Checklist comptes ops + exécution 2FA

**Files:**
- Create: `docs/v3/ops/accounts-checklist.md`

**Pourquoi d'abord:** Hygiène de base, zéro dépendance code, exécutable immédiatement par l'utilisateur. Protège l'acteur C (compte tiers compromis) de la mesure défensive #13 du threat model.

- [ ] **Step 1: Rédiger la checklist**

Créer `docs/v3/ops/accounts-checklist.md` avec ce contenu :

```markdown
# Checklist comptes ops — sécurité

> Statut cible : **tous les comptes listés doivent avoir 2FA activé + mot de passe unique >= 16 chars stocké dans un gestionnaire (Bitwarden, 1Password, etc.)**.
> Dernière vérification : <date>

## Comptes critiques (bloquant avant toute ouverture v3 au public)

| Compte | 2FA activé ? | Méthode 2FA | MDP unique ≥16 ? | Email de récupération | Remarques |
|---|---|---|---|---|---|
| GitHub (repo + releases + signing key) | ☐ | TOTP / clé hardware | ☐ | ☐ | Secrets repo = clé privée updater, tokens CI. 2FA obligatoire. |
| Supabase (projet v3) | ☐ | TOTP | ☐ | ☐ | Plan Pro, région EU. Owner = email personnel. |
| Lemon Squeezy (futur, v3.2) | ☐ | TOTP | ☐ | ☐ | À activer lors de l'ouverture du compte. |
| Google Cloud Console (OAuth app) | ☐ | TOTP / clé hardware | ☐ | ☐ | App OAuth Voice Tool. |
| Cloudflare (Pages auth-callback + DNS futur) | ☐ | TOTP | ☐ | ☐ | DNS futur, cf. sous-épique 06. |
| Registrar DNS (futur) | ☐ | TOTP | ☐ | ☐ | À activer à l'achat du domaine. |
| Gestionnaire de mots de passe | ☐ | TOTP | — (MDP maître) | ☐ | Le maillon central ; MDP maître très long + 2FA. |

## Procédure

1. Pour chaque compte ci-dessus, se connecter aux settings sécurité.
2. Activer 2FA TOTP (ou clé hardware si disponible) — **pas de SMS** (SIM swap).
3. Stocker les recovery codes dans le gestionnaire de mots de passe.
4. Cocher la case dans le tableau + dater la vérif.

## Revue

- Révision **trimestrielle** (mettre un rappel calendrier).
- Révision immédiate si suspicion de compromission.
```

- [ ] **Step 2: Exécuter la checklist**

**Action utilisateur requise** : parcourir les comptes existants (GitHub, Supabase si déjà créé, gestionnaire de mots de passe), activer 2FA là où ce n'est pas déjà fait, mettre à jour le tableau avec les coches et la date.

- [ ] **Step 3: Commit**

```bash
git add docs/v3/ops/accounts-checklist.md
git commit -m "docs(v3): add ops accounts 2FA checklist"
```

---

## Task 2: CI — pnpm audit gate

**Files:**
- Create: `.github/workflows/security-audit.yml`

**Mesure threat model #14.** Bloque tout merge si une dépendance npm a une CVE HIGH ou CRITICAL non patchée.

- [ ] **Step 1: Créer le workflow avec le job pnpm-audit**

Créer `.github/workflows/security-audit.yml` :

```yaml
name: Security Audit

on:
  pull_request:
    branches: [main]
  schedule:
    # Tous les jours à 06:00 UTC
    - cron: '0 6 * * *'
  workflow_dispatch:

permissions:
  contents: read

jobs:
  pnpm-audit:
    name: pnpm audit (HIGH/CRITICAL gate)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'

      - name: Install dependencies (frozen lockfile)
        run: pnpm install --frozen-lockfile

      - name: Audit production dependencies
        run: pnpm audit --prod --audit-level high
```

- [ ] **Step 2: Valider le workflow localement (syntaxe YAML)**

Run : `pnpm exec js-yaml .github/workflows/security-audit.yml > /dev/null` si `js-yaml` dispo, sinon ouvrir le fichier et vérifier visuellement.
Expected : pas d'erreur.

- [ ] **Step 3: Pousser sur une branche jetable pour vérifier que le job tourne**

```bash
git checkout -b v3-sec-audit-test
git add .github/workflows/security-audit.yml
git commit -m "ci: add pnpm audit gate for HIGH/CRITICAL CVE"
git push origin v3-sec-audit-test
```

**Action utilisateur** : vérifier sur https://github.com/<user>/voice-tool/actions que le workflow tourne bien, que le job `pnpm-audit` PASS (ou FAIL sur une CVE connue — auquel cas investiguer).

- [ ] **Step 4: Merger quand vert**

Créer une PR depuis la branche `v3-sec-audit-test`, la merger sur `main`. Ne pas supprimer la branche avant d'avoir la confirmation que le cron tourne sur main.

---

## Task 3: CI — cargo audit gate (ajout au même workflow)

**Files:**
- Modify: `.github/workflows/security-audit.yml`

**Mesure threat model #14.** Même principe que Task 2 mais côté Rust.

- [ ] **Step 1: Ajouter le job cargo-audit au workflow**

Ajouter à la fin de `.github/workflows/security-audit.yml` (après le job `pnpm-audit`) :

```yaml
  cargo-audit:
    name: cargo audit (HIGH/CRITICAL gate)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: dtolnay/rust-toolchain@stable

      - name: Install cargo-audit
        run: cargo install --locked cargo-audit

      - name: Run cargo audit
        working-directory: src-tauri
        run: cargo audit --deny warnings
```

Note : `--deny warnings` fait échouer le build sur toute advisory (unmaintained, vulnerable, etc.). Si trop strict en pratique, downgrade à `cargo audit` sans flag (exit code 1 uniquement sur vuln). Tester d'abord avec `--deny warnings`, ajuster au besoin après le premier run.

- [ ] **Step 2: Pousser sur la même branche jetable**

```bash
git add .github/workflows/security-audit.yml
git commit -m "ci: add cargo audit gate for Rust dependencies"
git push origin v3-sec-audit-test
```

- [ ] **Step 3: Vérifier le run**

**Action utilisateur** : sur GitHub Actions, vérifier que le job `cargo-audit` tourne et PASS. Si FAIL sur une advisory existante : investiguer (bumper la dép concernée dans `Cargo.toml` ou ajouter un ignore justifié dans `src-tauri/.cargo/audit.toml`).

- [ ] **Step 4: Merger la PR Task 2+3 sur main**

Une fois Task 2 et Task 3 verts, merger la PR.

---

## Task 4: CI — scanner anti-leak service role key

**Files:**
- Create: `.github/scripts/scan-secrets-in-bundles.mjs`
- Create: `.github/workflows/secret-scan.yml`

**Mesure threat model #2.** Audit CI qui fail si une clé Supabase service role (`sb_secret_*` ou JWT `eyJ...` avec `"role":"service_role"`) ou une clé privée se retrouve dans les bundles frontend (`dist/`) ou le binaire Tauri (`src-tauri/target/release/bundle/`).

- [ ] **Step 1: Créer le script scanner**

Créer `.github/scripts/scan-secrets-in-bundles.mjs` :

```javascript
#!/usr/bin/env node
/**
 * Scan release artifacts for leaked secrets.
 * Fails with exit code 1 if any pattern is found.
 *
 * Scanned directories:
 *   - dist/                        (frontend bundles after `pnpm build`)
 *   - src-tauri/target/release/    (Tauri binary + bundles)
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const ROOTS = ['dist', 'src-tauri/target/release'];

// Patterns sensibles. Toute correspondance = build cassé.
const PATTERNS = [
  // Supabase service role key (nouveau format explicite)
  { name: 'supabase-service-role-key', re: /sb_secret_[A-Za-z0-9_-]{20,}/g },
  // Supabase service role JWT (legacy, détectable via la chaîne "service_role" dans un JWT)
  { name: 'supabase-service-role-jwt', re: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]*service_role[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+/g },
  // Clé privée PEM
  { name: 'pem-private-key', re: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  // Lemon Squeezy API key (préfixe documenté)
  { name: 'lemonsqueezy-api-key', re: /lsq_[A-Za-z0-9]{20,}/g },
];

// Extensions à ouvrir en mode texte.
const TEXT_EXTS = new Set(['.js', '.mjs', '.cjs', '.ts', '.html', '.css', '.json', '.map', '.txt', '.md', '.yml', '.yaml']);

let findings = [];

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return;
    throw e;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      // Ignorer les sous-dirs build intermediaires lourds.
      if (['node_modules', 'deps', 'build', 'incremental', '.fingerprint'].includes(e.name)) continue;
      await walk(p);
    } else if (e.isFile()) {
      await scanFile(p);
    }
  }
}

async function scanFile(p) {
  const ext = p.slice(p.lastIndexOf('.')).toLowerCase();
  const s = await stat(p);
  if (s.size > 50 * 1024 * 1024) return; // skip > 50 MB
  const isText = TEXT_EXTS.has(ext);
  let buf;
  try {
    buf = await readFile(p);
  } catch {
    return;
  }
  // Pour les binaires, on fait un scan ASCII brut (string search).
  const content = isText ? buf.toString('utf8') : buf.toString('binary');
  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    const m = content.match(re);
    if (m) {
      findings.push({ file: p, pattern: name, count: m.length });
    }
  }
}

for (const root of ROOTS) {
  await walk(root);
}

if (findings.length > 0) {
  console.error('❌ Secret leak detected in release artifacts:');
  for (const f of findings) {
    console.error(`  - ${f.file}: pattern "${f.pattern}" (${f.count} match${f.count > 1 ? 'es' : ''})`);
  }
  console.error('\nFail. See docs/v3/00-threat-model.md#mesures-défensives measure #2.');
  process.exit(1);
}

console.log('✅ No secret patterns found in release artifacts.');
process.exit(0);
```

- [ ] **Step 2: Tester le script localement avec un faux positif injecté**

```bash
# Créer un fichier test avec un pattern bidon
mkdir -p dist
echo "const k = 'sb_secret_FAKE_TEST_PATTERN_01234567890123456789';" > dist/test-leak.js

# Lancer le scanner
node .github/scripts/scan-secrets-in-bundles.mjs
```

Expected : exit code 1, message `❌ Secret leak detected` listant `dist/test-leak.js`.

- [ ] **Step 3: Nettoyer le fichier test et vérifier le pass**

```bash
rm dist/test-leak.js
node .github/scripts/scan-secrets-in-bundles.mjs
```

Expected : exit code 0, message `✅ No secret patterns found`.

- [ ] **Step 4: Créer le workflow qui appelle le scanner**

Créer `.github/workflows/secret-scan.yml` :

```yaml
name: Secret Scan

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  scan-frontend-bundle:
    name: Scan frontend bundle for leaked secrets
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build frontend
        run: pnpm build

      - name: Scan dist/ for leaked secrets
        run: node .github/scripts/scan-secrets-in-bundles.mjs
```

Note : on ne scanne **pas** le binaire Tauri dans ce workflow (il prend ~15 min à compiler sur Windows et le job tournerait sur chaque PR). Le scan du binaire Tauri sera intégré au workflow `release.yml` existant dans une sous-tâche séparée (ajout en Step 6 ci-dessous, au moment du build des installers — ce qui a lieu uniquement sur tag `v*`).

- [ ] **Step 5: Pousser, vérifier que le job PASS**

```bash
git add .github/scripts/scan-secrets-in-bundles.mjs .github/workflows/secret-scan.yml
git commit -m "ci: add secret leak scanner for release artifacts"
git push origin v3-sec-audit-test
```

**Action utilisateur** : vérifier que `Secret Scan` PASS sur GitHub Actions.

- [ ] **Step 6: Ajouter le scan binaire Tauri dans `release.yml`**

Modifier `.github/workflows/release.yml` en ajoutant un job qui, après le build des installers, télécharge les artifacts et lance le scanner.

Lire d'abord `.github/workflows/release.yml` pour identifier les jobs de build existants. Ajouter **à la fin** :

```yaml
  scan-release-artifacts:
    name: Scan release artifacts for leaked secrets
    runs-on: ubuntu-latest
    needs: [generate-update-manifests]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Download release artifacts
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          mkdir -p src-tauri/target/release/bundle
          gh release download ${{ github.ref_name }} --dir src-tauri/target/release/bundle --pattern '*'

      - name: Scan bundles for leaked secrets
        run: node .github/scripts/scan-secrets-in-bundles.mjs
```

Note : ce job télécharge les artifacts GitHub Release du tag courant et lance le scanner dessus. Si le release workflow actuel ne publie pas via `gh release` mais via `tauri-apps/tauri-action`, adapter : récupérer les artifacts via `actions/download-artifact` à la place.

**Action utilisateur** : valider que le job `scan-release-artifacts` tourne correctement au prochain tag de test (`vX.Y.Z-ci-test`).

- [ ] **Step 7: Commit final**

```bash
git add .github/workflows/release.yml
git commit -m "ci: scan release artifacts after bundle build"
```

---

## Task 5: Créer les trois index runbooks / compliance / ops

**Files:**
- Create: `docs/v3/runbooks/README.md`
- Create: `docs/v3/compliance/README.md`
- Create: `docs/v3/ops/README.md`

**Pourquoi:** Squelette de navigation avant de remplir les runbooks eux-mêmes.

- [ ] **Step 1: Créer `docs/v3/runbooks/README.md`**

```markdown
# Runbooks v3

Procédures opérationnelles pour la v3 (rotation secrets, backup, incident).

## Index

- [`secrets-rotation.md`](secrets-rotation.md) — rotation JWT secret, webhook LS, service role key, clé updater
- [`backup-restore-test.md`](backup-restore-test.md) — test trimestriel de restauration Supabase
- [`incident-response.md`](incident-response.md) — plan incident + notification GDPR <72h

## Convention

- Chaque runbook suit le format : **Préconditions** → **Procédure pas-à-pas** → **Vérification** → **Rollback**.
- Toute exécution d'un runbook est datée dans la section "Historique d'exécution" du runbook concerné.
- Toute modification de runbook passe par une PR.
```

- [ ] **Step 2: Créer `docs/v3/compliance/README.md`**

```markdown
# Compliance GDPR — v3

Documentation interne de conformité. **Pas destiné au public** (privacy policy publique = sous-épique 06).

## Index

- [`registre-traitements.md`](registre-traitements.md) — registre des traitements (art. 30 GDPR)
- [`base-legale.md`](base-legale.md) — base légale par traitement (art. 6 GDPR)

## Mise à jour

Réviser à chaque release majeure et à chaque ajout/modification de traitement (ex: nouveau champ collecté, nouveau sous-traitant).
```

- [ ] **Step 3: Créer `docs/v3/ops/README.md`**

```markdown
# Ops v3

Procédures de création et de bootstrap des infrastructures v3.

## Index

- [`accounts-checklist.md`](accounts-checklist.md) — 2FA tous comptes ops
- [`supabase-bootstrap.md`](supabase-bootstrap.md) — création projet Supabase EU Pro
- [`cloudflare-pages-bootstrap.md`](cloudflare-pages-bootstrap.md) — création projet Cloudflare Pages

## Principe

Toute ressource externe (compte, projet, DNS, certificat) doit avoir un document de bootstrap **reproductible** ici, pour que n'importe qui puisse la recréer à froid en cas de perte.
```

- [ ] **Step 4: Commit**

```bash
git add docs/v3/runbooks/README.md docs/v3/compliance/README.md docs/v3/ops/README.md
git commit -m "docs(v3): scaffold runbooks, compliance, ops index files"
```

---

## Task 6: Bootstrap Supabase EU Pro — procédure + exécution

**Files:**
- Create: `docs/v3/ops/supabase-bootstrap.md`

**Pourquoi:** Toutes les autres sous-épiques (01, 02, 03, 04) dépendent d'un projet Supabase EU Pro avec backups chiffrés. À créer **maintenant**, avant que 01 ne démarre.

- [ ] **Step 1: Rédiger la procédure**

Créer `docs/v3/ops/supabase-bootstrap.md` :

```markdown
# Bootstrap — projet Supabase EU Pro

## Objectif

Créer le projet Supabase de production v3 avec les paramètres figés par ADR 0007 et le threat model.

## Préconditions

- Compte Supabase avec 2FA activé (cf. [`accounts-checklist.md`](accounts-checklist.md))
- Carte bancaire pour le plan Pro (~25 $/mois)
- Email de contact technique défini

## Paramètres figés

| Paramètre | Valeur | Source |
|---|---|---|
| Nom projet | `voice-tool-v3-prod` | — |
| Plan | Pro | ADR 0007 |
| Région | `eu-central-1` (Frankfurt) ou `eu-west-2` (London) | Threat model (hébergement EU pour GDPR) |
| Password DB | généré aléatoirement ≥32 chars, stocké gestionnaire mdp | Standard |
| Enable Point-in-Time Recovery (PITR) | ✅ oui (7 jours min) | Threat model mesure #11 |
| Daily backups | ✅ activé (rétention 7 jours Pro) | Idem |

## Procédure

1. Se connecter à https://supabase.com/dashboard
2. `New Project` → organisation personnelle → nom `voice-tool-v3-prod`
3. Choisir région EU (Frankfurt de préférence, plus proche des users FR)
4. Générer et copier le `Database password` dans le gestionnaire de mots de passe (entrée `voice-tool-v3-prod-db-password`)
5. Upgrader le projet au plan Pro (`Settings` → `Billing` → `Change subscription plan` → Pro)
6. Activer PITR : `Settings` → `Database` → `Point-in-time Recovery` → Enable
7. Vérifier que les daily backups sont actifs : `Database` → `Backups`
8. Noter l'URL du projet et l'`anon key` **publique** dans `docs/v3/ops/supabase-bootstrap.md` (section "Identifiants non-secrets" ci-dessous)
9. **Ne jamais commiter** le `service_role key` ni le DB password

## Identifiants non-secrets (à remplir après création)

- Project ref : `<à remplir>`
- Project URL : `https://<ref>.supabase.co`
- Anon (public) key : `<à remplir — JWT public, OK à committer>`
- Région : `<à remplir>`
- Date de création : `<à remplir>`

## Identifiants secrets — où ils vivent

| Secret | Stockage | Usage |
|---|---|---|
| `service_role` key | GitHub Secrets (`SUPABASE_SERVICE_ROLE_KEY`) + gestionnaire mdp perso | Edge functions, tests d'intégration (jamais côté client) |
| DB password | Gestionnaire mdp perso uniquement | Accès DB admin exceptionnel |
| Project ref | Peut être commité (non secret) | Config app |

## DPA (Data Processing Agreement)

Sur le plan Pro, le DPA est automatiquement inclus et accessible depuis `Settings` → `Billing` → `Data Processing Agreement`.

- [ ] DPA Supabase consulté et archivé localement : `docs/v3/compliance/dpa-supabase-YYYY-MM-DD.pdf` (ne pas commiter si le DPA contient des données commerciales — archiver ailleurs et référencer en texte).

## Vérification

- [ ] Projet accessible depuis le dashboard Supabase
- [ ] Région confirmée EU (vérifier `Settings` → `General`)
- [ ] PITR actif
- [ ] Backups quotidiens actifs
- [ ] `service_role` key ajoutée à GitHub Secrets (mais **pas utilisée** pour l'instant — sera consommée par sous-épique 01)
- [ ] DPA consulté

## Rollback

- Supprimer le projet via `Settings` → `General` → `Delete project`
- Annuler l'abonnement Pro via `Settings` → `Billing`

## Historique d'exécution

| Date | Opérateur | Notes |
|---|---|---|
| <à remplir> | nolyo | Bootstrap initial |
```

- [ ] **Step 2: Exécuter la procédure**

**Action utilisateur requise** : suivre la procédure ci-dessus, créer le projet Supabase Pro EU, remplir la section "Identifiants non-secrets", archiver le DPA, ajouter la `service_role` key dans GitHub Secrets.

- [ ] **Step 3: Mettre à jour le fichier avec les identifiants réels**

Une fois le projet créé, remplacer les `<à remplir>` dans `docs/v3/ops/supabase-bootstrap.md` par les valeurs réelles. L'anon key + project ref sont publics et peuvent être commités.

- [ ] **Step 4: Commit**

```bash
git add docs/v3/ops/supabase-bootstrap.md
git commit -m "docs(v3): bootstrap Supabase Pro EU project"
```

---

## Task 7: Runbook backup / restore test (avec exécution initiale)

**Files:**
- Create: `docs/v3/runbooks/backup-restore-test.md`

**Mesure threat model #11.** Un backup non testé n'est pas un backup.

- [ ] **Step 1: Rédiger le runbook**

Créer `docs/v3/runbooks/backup-restore-test.md` :

```markdown
# Runbook — test de restauration backup Supabase

## Fréquence

**Trimestrielle.** Ajouter un rappel calendrier récurrent.

## Objectif

Garantir qu'un backup Supabase Pro est effectivement restaurable, pas juste présent.

## Préconditions

- Projet Supabase Pro `voice-tool-v3-prod` créé (cf. [`../ops/supabase-bootstrap.md`](../ops/supabase-bootstrap.md))
- Accès owner au projet
- PITR activé

## Procédure

1. Dans le dashboard Supabase : `Database` → `Backups`
2. Identifier le backup le plus récent (daily)
3. Noter son timestamp
4. Option A (recommandée) : créer un **nouveau projet de staging** `voice-tool-v3-restore-test-YYYY-MM-DD` et restaurer le backup dedans via `Restore to new project`
5. Option B (si non supporté par la UI) : utiliser PITR pour restaurer en place vers un timestamp dans les 7 derniers jours (attention : cela impacte la prod — à ne faire qu'en période creuse ou avec maintenance prévue)
6. Une fois restauré :
   - Se connecter en SQL : `select count(*) from auth.users;`
   - Vérifier que les comptes de test existent
   - Si sous-épique 02 déjà déployée : `select count(*) from user_settings;` doit retourner ≥ 1 ligne par user
   - Si sous-épique 03 déjà déployée : `select count(*) from notes;` doit être > 0
7. Supprimer le projet de staging une fois la vérif faite (éviter de payer pour rien)

## Vérification

- [ ] Backup restauré sans erreur
- [ ] Requêtes SQL de contrôle renvoient des résultats cohérents
- [ ] Projet de staging supprimé

## Rollback

Si la restauration échoue : ouvrir un ticket support Supabase **immédiatement**. Un backup non restaurable = incident CRITIQUE.

## Historique d'exécution

| Date | Opérateur | Résultat | Notes |
|---|---|---|---|
| <à remplir> | | | |
```

- [ ] **Step 2: Exécuter le premier test (une fois Supabase créé en Task 6)**

**Action utilisateur requise** : attendre qu'il y ait au moins 1 jour de backup disponible sur le projet Supabase créé en Task 6, puis exécuter la procédure. Remplir la ligne dans "Historique d'exécution".

- [ ] **Step 3: Commit**

```bash
git add docs/v3/runbooks/backup-restore-test.md
git commit -m "docs(v3): add backup restore test runbook"
```

---

## Task 8: Bootstrap Cloudflare Pages (projet placeholder)

**Files:**
- Create: `docs/v3/ops/cloudflare-pages-bootstrap.md`

**Pourquoi:** ADR 0007 fige Cloudflare Pages pour `auth.<domaine>`. Créer le projet vide maintenant évite le blocage au démarrage du sous-épique 01.

- [ ] **Step 1: Rédiger la procédure**

Créer `docs/v3/ops/cloudflare-pages-bootstrap.md` :

```markdown
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
```

- [ ] **Step 2: Exécuter la procédure**

**Action utilisateur requise** : créer le projet Cloudflare Pages avec le placeholder, noter l'URL publique.

- [ ] **Step 3: Commit**

```bash
git add docs/v3/ops/cloudflare-pages-bootstrap.md
git commit -m "docs(v3): bootstrap Cloudflare Pages auth-callback placeholder"
```

---

## Task 9: Runbook rotation des secrets

**Files:**
- Create: `docs/v3/runbooks/secrets-rotation.md`

**Mesure threat model #6.** Documenter la rotation pour qu'elle ne soit pas improvisée en panique un dimanche.

- [ ] **Step 1: Rédiger le runbook**

Créer `docs/v3/runbooks/secrets-rotation.md` :

```markdown
# Runbook — rotation des secrets

## Fréquence

- **Préventive** : annuelle, sans urgence.
- **Immédiate** : si suspicion de compromission (fuite, logs exposés, départ d'un tiers ayant eu accès, scan révélant un pattern dans un bundle publié).

## Secrets couverts

| Secret | Où | Impact rotation | Procédure ci-dessous |
|---|---|---|---|
| Supabase `service_role` key | Supabase dashboard + GitHub Secrets | Edge functions HS pendant la bascule | §1 |
| Supabase JWT secret | Supabase dashboard | **Invalidation de toutes les sessions users** | §2 |
| Webhook secret Lemon Squeezy (v3.2+) | LS dashboard + env var côté Edge Function | Webhooks rejetés jusqu'à bascule | §3 |
| Clé privée updater (Tauri) | GitHub Secret `TAURI_SIGNING_PRIVATE_KEY` | **Nouvelles releases ne seront pas reconnues par les anciennes versions de l'app** (blocage update) | §4 |
| DB password Supabase | Gestionnaire mdp perso uniquement | Accès admin SQL pendant la bascule | §5 |

## §1 — Rotation `service_role` key

1. Dashboard Supabase → `Settings` → `API` → `Reset service_role key`
2. Copier la nouvelle clé
3. GitHub → `Settings` → `Secrets and variables` → `Actions` → éditer `SUPABASE_SERVICE_ROLE_KEY`
4. Relancer tous les workflows qui dépendent du secret (Edge Functions deploy, tests d'intégration)
5. Mettre à jour le gestionnaire de mots de passe perso
6. Vérifier : 1 edge function marche en appelant un endpoint qui requiert service_role

## §2 — Rotation JWT secret

⚠️ **Bascule destructrice pour les users**. Planifier en maintenance.

1. Prévenir les users via status page / email
2. Dashboard Supabase → `Settings` → `API` → `Regenerate JWT secret`
3. Tous les tokens existants deviennent invalides → users devront se reconnecter
4. Aucun changement GitHub à faire (Supabase gère la clé côté serveur)

## §3 — Rotation webhook Lemon Squeezy

(À documenter précisément lors du sous-épique 04 quand LS sera intégré. Placeholder pour l'instant.)

## §4 — Rotation clé privée updater

⚠️ **À ne faire qu'en cas d'exposition avérée**. La clé privée publie toutes les releases ; la changer signifie que les users sur la version N ne pourront pas auto-update vers N+1 signée avec la nouvelle clé tant qu'ils n'auront pas réinstallé manuellement.

1. Générer la nouvelle paire : `pnpm tauri signer generate --write-keys src-tauri/private.key --ci -p ""`
2. Ne **pas** commiter `src-tauri/private.key`
3. Remplacer la clé publique dans `src-tauri/tauri.conf.json` (champ `plugins.updater.pubkey`)
4. GitHub → `Settings` → `Secrets` → remplacer `TAURI_SIGNING_PRIVATE_KEY` avec le contenu du nouveau fichier `.key`
5. Publier une release **avec communication** demandant aux users d'installer manuellement
6. Archiver l'ancienne clé dans un stockage sécurisé hors-ligne (peut servir pour vérifier des signatures d'anciens artefacts)

## §5 — Rotation DB password Supabase

1. Dashboard Supabase → `Settings` → `Database` → `Reset database password`
2. Mettre à jour le gestionnaire de mots de passe perso
3. Si une edge function ou un script externe utilise ce password directement (ce qui ne devrait pas être le cas — privilégier service_role key) : mettre à jour les secrets correspondants

## Historique des rotations

| Date | Secret | Raison (préventive / compromission) | Opérateur |
|---|---|---|---|
| <à remplir> | | | |
```

- [ ] **Step 2: Commit**

```bash
git add docs/v3/runbooks/secrets-rotation.md
git commit -m "docs(v3): add secrets rotation runbook"
```

---

## Task 10: Runbook plan de réponse à incident (GDPR <72h)

**Files:**
- Create: `docs/v3/runbooks/incident-response.md`

**Mesure threat model #12 + GDPR #7.** Sans ce document, impossible de notifier la CNIL dans les 72h imposées par l'article 33 GDPR.

- [ ] **Step 1: Rédiger le runbook**

Créer `docs/v3/runbooks/incident-response.md` :

```markdown
# Runbook — réponse à incident de sécurité

## Portée

Tout événement pouvant compromettre la confidentialité, l'intégrité ou la disponibilité des données utilisateurs : fuite, accès non autorisé, ransomware, perte de données, compte ops compromis.

## Rôles

Dev solo → un seul opérateur, **qui prend toutes les décisions**. En cas d'incapacité temporaire (maladie, indisponibilité), le projet reste offline jusqu'au retour — accepté consciemment (cf. threat model acteur D).

## Horloge GDPR

Depuis la **prise de connaissance** de la fuite (détection, alerte, signalement tiers) :

- **T+0** : détection / alerte
- **T+24h** : premier diagnostic terminé, décision de gravité prise
- **T+48h** : mitigation déployée OU décision de coupure service
- **T+72h** : **notification CNIL obligatoire** si fuite confirmée impactant des données perso
- **T+72h à T+... (selon gravité)** : notification aux users impactés (obligatoire si "risque élevé pour les droits et libertés")

## Procédure

### Phase 1 — Détection et contention (T+0 à T+4h)

1. Noter l'heure exacte de détection dans ce runbook (section historique)
2. Identifier la surface impactée : auth, DB, edge function, CI, compte ops, release updater
3. Si compte ops compromis : changer immédiatement le mot de passe, révoquer les sessions, activer 2FA si ce n'était pas fait
4. Si DB compromise (accès non autorisé confirmé) : isoler — passer le projet Supabase en mode maintenance ou bloquer l'IP suspecte via `policies`
5. Si release updater compromise (ex: clé privée fuitée) : retirer les dernières releases du feed public, exécuter §4 du runbook `secrets-rotation.md`
6. Geler les déploiements (pas de `git push --tags` pendant l'investigation)

### Phase 2 — Diagnostic (T+4h à T+24h)

1. Quelle donnée a été exposée ? (emails, notes, settings, sessions…)
2. Combien d'utilisateurs impactés ?
3. Depuis quand ?
4. L'attaquant a-t-il modifié des données (intégrité) ?
5. Constituer un dossier : logs Supabase, logs GitHub Actions, screenshots, timeline
6. Si fuite **avérée** impactant données perso → passer en Phase 3. Si faux positif → documenter et clôturer.

### Phase 3 — Notification (T+24h à T+72h)

1. **CNIL** : notifier via https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles avant T+72h
   - Nature de la violation
   - Catégories et nombre approximatif de personnes concernées
   - Conséquences probables
   - Mesures prises ou envisagées
2. **Users impactés** : email individuel si "risque élevé" (fuite de hashes password, notes complètes en clair, etc.)
   - Template FR/EN à préparer à l'avance (section "Templates" ci-dessous)
3. **Site marketing / statut** : page publique sobre avec timeline et mesures prises

### Phase 4 — Remédiation et post-mortem (T+72h et après)

1. Déployer le fix définitif (pas juste la contention)
2. Post-mortem écrit dans `docs/v3/incidents/YYYY-MM-DD-<slug>.md` (créer le dossier à cette occasion) : timeline, cause racine, ce qui a bien marché, ce qui a mal marché, actions correctives
3. Mettre à jour le threat model si un nouveau vecteur est découvert
4. Si la cause racine est un actif/acteur hors-scope du threat model initial : reclassification et révision ADR 0006

## Templates

### Template email user impacté (FR)

```
Sujet : Voice Tool — incident de sécurité vous concernant

Bonjour,

Le <date>, nous avons découvert que <nature de l'incident>. Vos données suivantes ont été exposées : <liste>.

Nous avons pris les mesures suivantes : <liste>.

Vous pouvez protéger votre compte en :
1. Changeant votre mot de passe (lien : <url>)
2. Activant le 2FA dans les paramètres
3. Vérifiant la liste des appareils connectés

Nous avons notifié la CNIL conformément au GDPR. Pour toute question : security@voice-tool.app.

Nos excuses sincères.

L'équipe Voice Tool
```

### Template email user impacté (EN)

(Traduction miroir à préparer.)

## Contacts utiles

- **CNIL** : https://www.cnil.fr/ — notification en ligne
- **Supabase support** : https://supabase.com/support (gratuit Pro, payant Enterprise)
- **GitHub security** : https://github.com/contact (report-a-user si compromission GitHub)

## Historique d'incidents

Aucun à ce jour.

| Date détection | Slug | Gravité | Post-mortem |
|---|---|---|---|
| — | — | — | — |
```

- [ ] **Step 2: Commit**

```bash
git add docs/v3/runbooks/incident-response.md
git commit -m "docs(v3): add incident response runbook with GDPR 72h flow"
```

---

## Task 11: Registre des traitements GDPR (art. 30)

**Files:**
- Create: `docs/v3/compliance/registre-traitements.md`

**GDPR must-have #1.** Doc interne, pas publique.

- [ ] **Step 1: Rédiger le registre**

Créer `docs/v3/compliance/registre-traitements.md` :

```markdown
# Registre des traitements — Voice Tool v3

> Art. 30 GDPR. **Doc interne** (pas destinée au public — la privacy policy publique est le sous-épique 06).
> Dernière mise à jour : <date>

## Responsable du traitement

- **Nom** : <à remplir — nom personnel ou société>
- **Contact** : `security@voice-tool.app`
- **Pays d'établissement** : France

## Traitements

### T01 — Création et gestion des comptes utilisateurs

| Champ | Valeur |
|---|---|
| Finalité | Permettre à l'utilisateur d'avoir un compte pour synchroniser ses settings/notes |
| Base légale | Exécution du contrat (art. 6.1.b GDPR) |
| Catégories de personnes | Utilisateurs Voice Tool ayant créé un compte |
| Catégories de données | Email, hash password (bcrypt), timestamp signup, timestamp dernière activité, device_id, recovery codes (si 2FA activé) |
| Destinataires | Supabase (sous-traitant, DPA signé) |
| Transferts hors UE | Aucun (région EU Supabase) |
| Durée de conservation | Durée du compte + 30 jours après demande de suppression (purge effective via "Delete account") |
| Mesures techniques | RLS, TLS, 2FA optionnel, hash bcrypt, rate limiting, logs sans PII |

### T02 — Synchronisation settings étendus (Y3)

| Champ | Valeur |
|---|---|
| Finalité | Retrouver son setup sur plusieurs machines |
| Base légale | Exécution du contrat |
| Catégories de personnes | Utilisateurs ayant activé la sync |
| Catégories de données | Settings UI (thème, langue), hotkeys, dico perso, snippets, prompts, préréglages |
| Destinataires | Supabase |
| Transferts hors UE | Aucun |
| Durée de conservation | Durée du compte + 30 jours |
| Mesures techniques | RLS, TLS, encryption at rest Postgres |

### T03 — Synchronisation notes (v3.1)

À compléter au démarrage du sous-épique 03.

### T04 — Billing (v3.2)

À compléter au démarrage du sous-épique 04.

### T05 — Logs serveur (Edge Functions Supabase)

| Champ | Valeur |
|---|---|
| Finalité | Debug, monitoring, rate limiting |
| Base légale | Intérêt légitime (art. 6.1.f) |
| Catégories de personnes | Utilisateurs ayant fait une requête à un endpoint serveur |
| Catégories de données | Timestamp, endpoint, code HTTP, user_id (UUID, pas email), IP (hash ou pseudonymisée) |
| **Exclusions strictes** | Pas d'email, pas de contenu notes, pas de JWT, pas de password — cf. threat model mesure #5 |
| Destinataires | Supabase (logs Edge Functions) |
| Durée de conservation | 30 jours |
| Mesures techniques | Linter de logs à prévoir (sous-épique 01) |

### T06 — Notifications email (nouveaux devices, reset password)

| Champ | Valeur |
|---|---|
| Finalité | Sécurité du compte |
| Base légale | Exécution du contrat (sécurité) |
| Catégories de données | Email, timestamp, nom du device (OS + navigateur) |
| Destinataires | Supabase (email provider intégré) |
| Durée de conservation | Pas de log conservé au-delà de l'envoi |
| Mesures techniques | TLS SMTP |

## Sous-traitants

| Sous-traitant | Finalité | Localisation | DPA signé | Certification |
|---|---|---|---|---|
| Supabase | Backend (auth, DB, storage, edge functions) | EU (Frankfurt) | ✅ (inclus plan Pro) | SOC 2 Type 2 |
| Cloudflare | Hébergement auth-callback static | Global (edge) | ✅ (DPA public) | ISO 27001 |
| Lemon Squeezy (v3.2+) | Billing (Merchant of Record) | US | À signer en v3.2 | PCI DSS niveau 1 |
| Google (OAuth, v3.0) | Authentification OAuth | Global | Inclus ToS Google Cloud | Standard |

## Droit des personnes — comment les exercer

| Droit | Procédure | Délai |
|---|---|---|
| Accès | Settings → "Exporter mes données" (JSON téléchargeable) | Immédiat |
| Rectification | Settings → modifier profil | Immédiat |
| Effacement | Settings → "Supprimer mon compte" — purge complète (notes, settings, sessions, row auth.users) | ≤30 jours |
| Portabilité | Idem "Exporter" — format JSON standard | Immédiat |
| Opposition | Contact `security@voice-tool.app` | ≤30 jours |

## Historique

| Date | Modification |
|---|---|
| <à remplir> | Création du registre (sous-épique v3-00) |
```

- [ ] **Step 2: Compléter les champs "<à remplir>"**

**Action utilisateur requise** : remplir le nom du responsable du traitement (nom personnel ou société si structure juridique existe), la date.

- [ ] **Step 3: Commit**

```bash
git add docs/v3/compliance/registre-traitements.md
git commit -m "docs(v3): add GDPR processing register"
```

---

## Task 12: Base légale par traitement

**Files:**
- Create: `docs/v3/compliance/base-legale.md`

**GDPR must-have #8.** Doc courte qui synthétise la base légale par catégorie de traitement, pour appuyer la privacy policy publique (sous-épique 06).

- [ ] **Step 1: Rédiger le doc**

Créer `docs/v3/compliance/base-legale.md` :

```markdown
# Base légale par traitement

> Art. 6 GDPR. Synthèse à usage interne, nourrit la privacy policy publique (sous-épique 06).

## Règle générale

Voice Tool v3 utilise **deux bases légales** selon les traitements :

1. **Exécution du contrat** (art. 6.1.b) — pour tout ce qui relève du service lui-même (compte, sync, billing).
2. **Intérêt légitime** (art. 6.1.f) — pour la sécurité et les logs techniques (rate limiting, anti-fraude).

Le **consentement explicite** (art. 6.1.a) n'est requis que pour les traitements non nécessaires au service (ex: cookies analytics — pas prévus v3.0).

## Détail par traitement

| Traitement | Base légale | Justification |
|---|---|---|
| T01 — Compte utilisateur | Exécution du contrat | Sans compte, le service "sync" ne peut pas exister |
| T02 — Sync settings | Exécution du contrat | Fonctionnalité contractualisée au signup |
| T03 — Sync notes (v3.1) | Exécution du contrat | Idem |
| T04 — Billing (v3.2) | Exécution du contrat | Facturation nécessaire au service payant |
| T05 — Logs serveur | Intérêt légitime | Sécurité du service, protection des users, aucune donnée sensible |
| T06 — Notifications sécurité | Exécution du contrat | Obligation de sécurité vis-à-vis de l'user (GDPR art. 32) |
| Analytics produit (v3.x, pas v3.0) | Consentement explicite | Non nécessaire au service, doit être opt-in |

## Points d'attention

- Le **mode local** (sans compte) ne traite aucune donnée perso chez nous. Pas de base légale nécessaire (traitement hors-scope Voice Tool serveur).
- La **suppression de compte** implique la destruction effective des données sous 30 jours max — sinon la base "exécution du contrat" tombe et il n'y a plus de justification à conserver les données.
- Toute nouvelle fonctionnalité doit être classifiée dans ce tableau **avant** déploiement.
```

- [ ] **Step 2: Commit**

```bash
git add docs/v3/compliance/base-legale.md
git commit -m "docs(v3): add GDPR legal basis document"
```

---

## Task 13: Mise à jour README v3 + 00-threat-model.md (livrables)

**Files:**
- Modify: `docs/v3/README.md`
- Modify: `docs/v3/00-threat-model.md`

**Pourquoi:** Le tableau d'avancement du README est désynchronisé (mentionne tout en "Stub" alors que 00/01/02 sont figés). Les livrables de 00 doivent aussi pointer vers les runbooks/compliance/ops livrés par ce plan.

- [ ] **Step 1: Mettre à jour `docs/v3/README.md`**

Remplacer la section "État d'avancement" par :

```markdown
## État d'avancement

| Sous-épique | Statut spec | Statut impl | Cible |
|---|---|---|---|
| 00 — Threat model & fondations | ✅ Figé 2026-04-22 | 🚧 En cours (ce plan) | Bloquant v3.0 |
| 01 — Auth | ✅ Figé 2026-04-22 | 📝 À planifier | v3.0 |
| 02 — Sync settings | ✅ Figé 2026-04-22 | 📝 À planifier | v3.0 |
| 03 — Sync notes | 📝 Stub | — | v3.1 |
| 04 — Billing | 📝 Stub (POC fait) | — | v3.2 |
| 05 — Managed transcription | 📝 Stub | — | v3.3 |
| 06 — Onboarding | 📝 Stub | — | v3.1 |

Légende statut spec : 📝 stub, 🚧 en cours, ✅ figé.
Légende statut impl : — non démarré, 📝 à planifier, 🚧 en cours, ✅ livré.
```

Dans la section `## Index`, ajouter après la liste des sous-épiques :

```markdown
- **[runbooks/](runbooks/)** — rotations, backups, incidents
- **[compliance/](compliance/)** — registre GDPR, base légale
- **[ops/](ops/)** — bootstrap Supabase, Cloudflare Pages, checklist 2FA
```

- [ ] **Step 2: Mettre à jour `docs/v3/00-threat-model.md`**

Dans la section "Livrables de cette session" (fin du fichier), remplacer par :

```markdown
## Livrables

### Spec (session 2026-04-22)

1. ✅ `00-threat-model.md` — threat model complet et figé
2. ✅ `SECURITY.md` à la racine — politique publique de divulgation
3. ✅ `decisions/0006-threat-model.md` — ADR figeant les choix structurants

### Implémentation (plan 2026-04-24)

4. ✅ `ops/accounts-checklist.md` + exécution 2FA tous comptes ops
5. ✅ `.github/workflows/security-audit.yml` — pnpm + cargo audit bloquants
6. ✅ `.github/workflows/secret-scan.yml` + script `scan-secrets-in-bundles.mjs`
7. ✅ `ops/supabase-bootstrap.md` + projet Supabase Pro EU créé
8. ✅ `ops/cloudflare-pages-bootstrap.md` + projet placeholder créé
9. ✅ `runbooks/secrets-rotation.md`
10. ✅ `runbooks/backup-restore-test.md` + premier test exécuté
11. ✅ `runbooks/incident-response.md` (GDPR 72h)
12. ✅ `compliance/registre-traitements.md`
13. ✅ `compliance/base-legale.md`
```

- [ ] **Step 3: Commit**

```bash
git add docs/v3/README.md docs/v3/00-threat-model.md
git commit -m "docs(v3): sync README status + update 00 livrables"
```

---

## Task 14: Mise à jour `CLAUDE.md` + memory

**Files:**
- Modify: `CLAUDE.md` (section Documentation ou équivalent)

**Pourquoi:** Rendre les nouveaux dossiers découvrables par les futures sessions Claude Code, sans qu'elles aient à fouiller.

- [ ] **Step 1: Identifier l'endroit approprié dans `CLAUDE.md`**

Chercher la section la plus proche de "Project Overview" ou "Architecture" qui mentionne `docs/`. Ajouter une note courte :

```markdown
### V3 Documentation

- `docs/v3/` — sous-épiques v3 (comptes, sync, billing)
- `docs/v3/runbooks/` — rotations, backups, incidents (cf. `docs/v3/runbooks/README.md`)
- `docs/v3/compliance/` — registre GDPR, base légale
- `docs/v3/ops/` — bootstrap infra (Supabase, Cloudflare Pages) et checklist 2FA
```

À placer après la section existante décrivant la structure du repo.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document v3 runbooks, compliance, ops folders in CLAUDE.md"
```

---

## Récapitulatif des ordres d'exécution

Les tâches **1, 2, 3, 4, 5, 7, 9, 10, 11, 12** sont indépendantes et peuvent être exécutées dans n'importe quel ordre (ou en parallèle via subagents).

Les tâches **6 et 8** nécessitent une action utilisateur hors-code (création de comptes Supabase + Cloudflare).

Les tâches **13 et 14** sont à faire **en dernier** (elles référencent les livrables des autres tâches).

## Sortie de sous-épique — critères d'acceptation

Sous-épique 00 peut être clôturé quand **tous** les points ci-dessous sont ✅ :

- [ ] `docs/v3/ops/accounts-checklist.md` créé et coché pour GitHub + Supabase + gestionnaire mdp (autres comptes cochables plus tard au fur et à mesure des créations)
- [ ] Workflow `security-audit.yml` vert sur `main` (pnpm + cargo)
- [ ] Workflow `secret-scan.yml` vert sur `main`
- [ ] Scanner `scan-secrets-in-bundles.mjs` intégré à `release.yml`
- [ ] Projet Supabase `voice-tool-v3-prod` EU Pro existant, PITR actif
- [ ] Projet Cloudflare Pages `voice-tool-auth-callback` avec placeholder accessible
- [ ] DPA Supabase consulté et archivé
- [ ] Les 3 runbooks rédigés
- [ ] Les 2 docs compliance rédigés
- [ ] `docs/v3/README.md` et `00-threat-model.md` mis à jour
- [ ] `CLAUDE.md` mis à jour
- [ ] ADR de clôture : créer `docs/v3/decisions/0009-sub-epic-00-closure.md` (optionnel — uniquement si des décisions émergent à la clôture qui n'étaient pas dans 0006)

Une fois tous ces points validés, **le sous-épique 00 est clos** et le sous-épique 01 (auth) peut démarrer son propre plan d'implémentation.
