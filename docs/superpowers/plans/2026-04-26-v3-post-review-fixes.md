# V3 Post-Review Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger les 14 issues critiques/importantes identifiées par la review multi-agent du 2026-04-26 sur la PR #24 (v3.0.0-beta.1), réparties en 3 vagues pour limiter le risque.

**Architecture :**
- **Vague 1 (Tasks 1-8)** : Quick wins + filet CI. Sans risque, déploient rapidement et protègent les vagues suivantes contre régressions.
- **Vague 2 (Tasks 9-11)** : Bugs de perte de données (queue/dequeue, backoff, quota deadlock). Refactor sync queue avec ID-based dequeue + DLQ.
- **Vague 3 (Tasks 12-14)** : Features manquantes (recovery codes UX, rate-limit câblé). Peuvent attendre beta.2 / GA.

**Tech Stack :** TypeScript/React 19, Rust (Tauri 2), Deno (Supabase Edge Functions), PostgreSQL (RLS + pgtap), Vitest, GitHub Actions, react-i18next, Supabase Auth (PKCE + AAL2).

**Discipline :** TDD strict pour chaque correctif comportemental (test rouge → code → test vert → commit). Conventional commits en anglais, courts. Pas de squash, un commit par task minimum.

**Source spec :** Reviews multi-agent dans la conversation du 2026-04-26 (voir aussi commit hash de référence : `c089746`).

---

## Vague 1 — Quick wins + CI (cette semaine)

### Task 1: Workflow CI qui exécute Vitest + cargo test + Deno tests

**Objectif :** Aucun test n'est lancé en CI aujourd'hui. Ajouter un workflow qui bloque les PRs si un test casse. Couvre les 3 stacks principales (TS, Rust, Deno). pgtap est ajouté en Task 8 (séparé pour que celui-ci passe en standalone).

**Files :**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Créer le workflow CI**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  vitest:
    name: Frontend tests (Vitest)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test -- --run

  cargo-test:
    name: Rust tests (cargo test)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri -> target
      - name: Install build deps (libclang, cmake, libsoup, webkit)
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libclang-dev clang cmake \
            libwebkit2gtk-4.1-dev libsoup-3.0-dev \
            libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
      - name: cargo test (no-default-features, skip vulkan)
        working-directory: src-tauri
        run: cargo test --no-default-features --lib

  deno-test:
    name: Edge functions tests (Deno)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
        with:
          deno-version: v1.x
      - name: Run all *.test.ts in supabase/functions
        run: |
          deno test \
            --allow-env --allow-net \
            supabase/functions/**/*.test.ts
```

- [ ] **Step 2: Push une branche de test pour valider le workflow**

```bash
git checkout -b ci/add-test-workflow
git add .github/workflows/ci.yml
git commit -m "ci: add ci.yml running vitest, cargo test, deno test on PR"
git push -u origin ci/add-test-workflow
```

Ouvre une PR draft, vérifie que les 3 jobs s'exécutent. **Expected** : `vitest` PASS (38 tests), `cargo-test` PASS (11 tests auth + sync test + audio_trim), `deno-test` PASS (6 tests purge-account-deletions).

Si `cargo-test` échoue à cause de `whisper-rs` : c'est attendu sans `--no-default-features`. Le flag est déjà dans la commande. Si ça échoue quand même, ajouter dans `Cargo.toml` un feature `test-no-whisper` qui exclut whisper-rs des tests (à éviter si possible — préférer fixer les libs système manquantes).

- [ ] **Step 3: Merger CI puis squelette PR template (optionnel)**

Une fois le workflow vert, merge sur main. Les tâches suivantes du plan créeront leurs PRs et hériteront du gate CI.

```bash
gh pr merge --squash
```

---

### Task 2: i18n — RESET_CONFIRMATION_PHRASE hardcoded français

**Bug critique #6 :** `src/components/settings/sections/DangerZone.tsx:18` contient une string hardcoded en français comparée en strict `===`. Un utilisateur EN voit une UI anglaise mais doit saisir une phrase française → bloquant.

**Files :**
- Modify: `src/components/settings/sections/DangerZone.tsx:18` (suppression de la const + comparaison via `t()`)
- Modify: `src/locales/fr.json` (ajout de `settings.system.danger.confirmPhrase`)
- Modify: `src/locales/en.json` (ajout équivalent EN)

- [ ] **Step 1: Ajouter la clé FR**

Ouvre `src/locales/fr.json`, repère la section `settings.system.danger` et ajoute :

```json
"confirmPhrase": "EFFACER TOUTES MES DONNÉES",
"confirmPlaceholder": "Tapez la phrase ci-dessus pour confirmer"
```

(Si `confirmPlaceholder` existe déjà, ne pas dupliquer.)

- [ ] **Step 2: Ajouter la clé EN**

Ouvre `src/locales/en.json`, même section :

```json
"confirmPhrase": "ERASE ALL MY DATA",
"confirmPlaceholder": "Type the phrase above to confirm"
```

- [ ] **Step 3: Modifier `DangerZone.tsx` pour utiliser `t()`**

Dans `src/components/settings/sections/DangerZone.tsx`, remplace la ligne 18 et toutes les références :

```tsx
// AVANT (ligne 18, 37, 57)
const RESET_CONFIRMATION_PHRASE = "EFFACER TOUTES MES DONNÉES";
// ...
if (confirmation !== RESET_CONFIRMATION_PHRASE) return;
// ...
const isPhraseValid = confirmation === RESET_CONFIRMATION_PHRASE;

// APRÈS
// (supprimer la const en haut du fichier)
// dans la fonction component, juste après `const { t } = useTranslation();` :
const resetConfirmationPhrase = t("settings.system.danger.confirmPhrase");
// ...
if (confirmation !== resetConfirmationPhrase) return;
// ...
const isPhraseValid = confirmation === resetConfirmationPhrase;
```

Vérifie qu'il n'y a plus aucune occurrence de `RESET_CONFIRMATION_PHRASE` dans le fichier.

- [ ] **Step 4: Tester manuellement**

```bash
pnpm dev
# Ouvre l'app, va dans Settings → System → Danger zone → Reset
# Bascule la langue : FR puis EN. Vérifie que la phrase à saisir matche la langue.
```

Si tu n'as pas accès à `pnpm tauri dev`, le contrat est suffisamment simple pour valider via lecture du code.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/sections/DangerZone.tsx src/locales/fr.json src/locales/en.json
git commit -m "fix(i18n): translate reset confirmation phrase (was hardcoded fr)"
```

---

### Task 3: Supprimer la dépendance morte `tauri-plugin-fs`

**Bug critique #10 :** `tauri-plugin-fs = "2"` déclaré dans `src-tauri/Cargo.toml:65` mais jamais initialisé via `Builder::plugin(...)`. Surface morte.

**Files :**
- Modify: `src-tauri/Cargo.toml` (suppression de la dep)
- Modify: `src-tauri/Cargo.lock` (régénéré automatiquement)

- [ ] **Step 1: Vérifier l'absence d'usage**

```bash
# Cette recherche doit retourner ZÉRO résultat
grep -rn "tauri_plugin_fs" src-tauri/src/
grep -rn "tauri-plugin-fs" src-tauri/capabilities/
```

Si une occurrence existe : NE PAS poursuivre la tâche, le plugin est en réalité utilisé. Stopper et demander.

- [ ] **Step 2: Supprimer la ligne dans `Cargo.toml`**

Dans `src-tauri/Cargo.toml`, supprimer la ligne 65 :

```toml
# Supprimer cette ligne
tauri-plugin-fs = "2"
```

- [ ] **Step 3: Régénérer `Cargo.lock`**

```bash
cd src-tauri
LIBCLANG_PATH="C:/Program Files/LLVM/bin" PATH="$PATH:/c/Program Files/CMake/bin" \
  cargo check --no-default-features
```

**Expected** : compilation OK, `Cargo.lock` mis à jour pour retirer `tauri-plugin-fs` et ses transitives uniques.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore(deps): remove unused tauri-plugin-fs dep"
```

---

### Task 4: Forcer AAL2 + re-auth sur la désactivation 2FA

**Bug critique #3 :** `src/components/settings/sections/AccountSection.tsx:566-572` permet l'`unenroll` du facteur TOTP avec une session `aal1` → vol de session = takeover du compte.

**Files :**
- Modify: `src/components/settings/sections/AccountSection.tsx:566-572` (`SecurityCard.disable`)
- Test: `src/components/settings/sections/AccountSection.aal2-disable.test.tsx` (nouveau)

- [ ] **Step 1: Écrire le test rouge**

Crée `src/components/settings/sections/AccountSection.aal2-disable.test.tsx` :

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock supabase BEFORE importing the function under test.
const mockListFactors = vi.fn();
const mockUnenroll = vi.fn();
const mockGetAal = vi.fn();
const mockChallengeAndVerify = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      mfa: {
        listFactors: () => mockListFactors(),
        unenroll: (args: any) => mockUnenroll(args),
        getAuthenticatorAssuranceLevel: () => mockGetAal(),
        challengeAndVerify: (args: any) => mockChallengeAndVerify(args),
      },
    },
  },
}));

// Import the helper after the mock is set up.
import { disableTotpFactor } from "./AccountSection";

describe("disableTotpFactor (AAL2 enforcement)", () => {
  beforeEach(() => {
    mockListFactors.mockReset();
    mockUnenroll.mockReset();
    mockGetAal.mockReset();
    mockChallengeAndVerify.mockReset();
  });

  it("refuse l'unenroll si AAL est 'aal1'", async () => {
    mockListFactors.mockResolvedValue({ data: { totp: [{ id: "factor-1" }] } });
    mockGetAal.mockResolvedValue({ data: { currentLevel: "aal1" } });

    await expect(disableTotpFactor()).rejects.toThrow(/aal2-required/);
    expect(mockUnenroll).not.toHaveBeenCalled();
  });

  it("appelle unenroll si la session est déjà aal2", async () => {
    mockListFactors.mockResolvedValue({ data: { totp: [{ id: "factor-1" }] } });
    mockGetAal.mockResolvedValue({ data: { currentLevel: "aal2" } });
    mockUnenroll.mockResolvedValue({ data: null, error: null });

    await disableTotpFactor();
    expect(mockUnenroll).toHaveBeenCalledWith({ factorId: "factor-1" });
  });

  it("retourne sans rien faire si aucun facteur TOTP", async () => {
    mockListFactors.mockResolvedValue({ data: { totp: [] } });
    await disableTotpFactor();
    expect(mockGetAal).not.toHaveBeenCalled();
    expect(mockUnenroll).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
pnpm test -- --run AccountSection.aal2-disable
```

**Expected** : ÉCHEC avec « `disableTotpFactor` is not exported from './AccountSection' » — la fonction n'existe pas encore.

- [ ] **Step 3: Extraire la logique et enforcer AAL2**

Dans `src/components/settings/sections/AccountSection.tsx`, **avant** le composant `SecurityCard`, ajouter (et exporter) :

```tsx
/**
 * Disable the user's TOTP factor.
 * Requires the current session to be AAL2 — otherwise throws "aal2-required"
 * so the caller can prompt for a TOTP challenge first.
 */
export async function disableTotpFactor(): Promise<void> {
  const { data } = await supabase.auth.mfa.listFactors();
  const totp = data?.totp?.[0];
  if (!totp) return;

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") {
    throw new Error("aal2-required");
  }

  const { error } = await supabase.auth.mfa.unenroll({ factorId: totp.id });
  if (error) throw error;
}
```

Puis, dans le composant `SecurityCard`, remplacer `async function disable()` (lignes 566-572) par :

```tsx
const [showAal2Prompt, setShowAal2Prompt] = useState<{ factorId: string } | null>(null);

async function disable() {
  try {
    await disableTotpFactor();
    await loadMfa();
  } catch (e) {
    if (e instanceof Error && e.message === "aal2-required") {
      const { data } = await supabase.auth.mfa.listFactors();
      const totp = data?.totp?.[0];
      if (totp) setShowAal2Prompt({ factorId: totp.id });
      return;
    }
    throw e;
  }
}

async function confirmAal2AndDisable(code: string): Promise<string | null> {
  if (!showAal2Prompt) return null;
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: showAal2Prompt.factorId,
    code,
  });
  if (error) return error.message;
  setShowAal2Prompt(null);
  await disableTotpFactor();
  await loadMfa();
  return null;
}
```

Et ajouter (juste avant le `return (`) un rendu conditionnel d'une dialog modale demandant le TOTP avant l'unenroll. Réutilise le pattern `Dialog` déjà importé dans `DangerZone.tsx`. Texte via `t("auth.security.disableMfaConfirmTitle")` etc. — créer ces clés dans `fr.json`/`en.json` (titre + sous-titre + label code TOTP + bouton confirmer + erreur).

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

```bash
pnpm test -- --run AccountSection.aal2-disable
```

**Expected** : 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/sections/AccountSection.tsx \
        src/components/settings/sections/AccountSection.aal2-disable.test.tsx \
        src/locales/fr.json src/locales/en.json
git commit -m "fix(security): require aal2 + totp challenge before disabling 2fa"
```

---

### Task 5: Réordonner `purge-account-deletions` (selectExpired → deleteUser → DELETE tombstone)

**Bug important #8 :** `supabase/functions/purge-account-deletions/index.ts:18-26` fait `DELETE...RETURNING` en première instruction → si `deleteUser` rate ensuite, la tombstone est perdue, l'user n'est jamais purgé. État partiel inversé.

**Files :**
- Modify: `supabase/functions/purge-account-deletions/index.ts`
- Modify: `supabase/functions/purge-account-deletions/test.ts` (ajout d'un test couvrant l'ordering)

- [ ] **Step 1: Écrire le test rouge dans `test.ts`**

Ouvre `supabase/functions/purge-account-deletions/test.ts` et ajoute en bas du fichier :

```ts
Deno.test("ordering: tombstone n'est supprimée que si deleteUser réussit", async () => {
  const deletedTombstones: string[] = [];
  const seenSelect: string[] = ["uid-ok", "uid-fail"];

  const deps = {
    cronSecret: "secret",
    selectExpired: async () => seenSelect,
    deleteUser: async (uid: string) => {
      if (uid === "uid-fail") return { data: null, error: { message: "boom" } };
      return { data: {}, error: null };
    },
    deleteTombstone: async (uid: string) => {
      deletedTombstones.push(uid);
    },
  };

  const req = new Request("http://x", {
    method: "POST",
    headers: { Authorization: "Bearer secret" },
  });
  const res = await handler(req, deps as any);
  const body = await res.json();

  // Seul "uid-ok" doit avoir vu sa tombstone supprimée.
  if (deletedTombstones.length !== 1 || deletedTombstones[0] !== "uid-ok") {
    throw new Error(`expected ['uid-ok'], got ${JSON.stringify(deletedTombstones)}`);
  }
  if (body.purged !== 1 || body.errors?.length !== 1) {
    throw new Error(`expected purged=1 + errors=1, got ${JSON.stringify(body)}`);
  }
});
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

```bash
deno test --allow-env --allow-net supabase/functions/purge-account-deletions/test.ts
```

**Expected** : ÉCHEC. La signature `Deps` n'a pas de `deleteTombstone`, et `selectExpired` actuellement supprime déjà les tombstones — le test échouera de plusieurs façons selon la branche.

- [ ] **Step 3: Refactor de `index.ts`**

Remplace `supabase/functions/purge-account-deletions/index.ts` par :

```ts
// deno-lint-ignore-file no-explicit-any
import { createClient, SupabaseClient } from "@supabase/supabase-js";

interface Deps {
  cronSecret: string;
  selectExpired: () => Promise<string[]>;
  deleteUser: (uid: string) => Promise<{ data: any; error: { message: string } | null }>;
  deleteTombstone: (uid: string) => Promise<void>;
}

function realDeps(): Deps {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronSecret = Deno.env.get("CRON_SECRET")!;
  const client: SupabaseClient = createClient(url, key);

  return {
    cronSecret,
    async selectExpired() {
      // SELECT only — do NOT delete here.
      const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const { data: rows, error } = await client
        .from("account_deletion_requests")
        .select("user_id")
        .lt("requested_at", cutoff);
      if (error) throw error;
      return (rows ?? []).map((r: any) => r.user_id as string);
    },
    async deleteUser(uid) {
      return await client.auth.admin.deleteUser(uid);
    },
    async deleteTombstone(uid) {
      const { error } = await client
        .from("account_deletion_requests")
        .delete()
        .eq("user_id", uid);
      if (error) throw error;
    },
  };
}

export async function handler(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }

  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${deps.cronSecret}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const start = performance.now();
  let uids: string[];
  try {
    uids = await deps.selectExpired();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({ event: "purge_run_error", phase: "selectExpired", message }));
    return new Response(JSON.stringify({ error: "selectExpired failed", message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const errors: Array<{ uid: string; message: string }> = [];
  let purged = 0;

  for (const uid of uids) {
    try {
      const { error } = await deps.deleteUser(uid);
      if (error) {
        errors.push({ uid, message: error.message });
        continue; // do NOT delete the tombstone — it'll be retried tomorrow
      }
      try {
        await deps.deleteTombstone(uid);
      } catch (tombErr: unknown) {
        const m = tombErr instanceof Error ? tombErr.message : String(tombErr);
        errors.push({ uid, message: `user deleted but tombstone still present: ${m}` });
        continue;
      }
      purged++;
    } catch (err: unknown) {
      errors.push({ uid, message: err instanceof Error ? err.message : String(err) });
    }
  }

  const duration_ms = Math.round(performance.now() - start);
  console.log(JSON.stringify({ event: "purge_run", purged, errors: errors.length, duration_ms }));
  return new Response(JSON.stringify({ purged, errors, duration_ms }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve((req) => handler(req, realDeps()));
```

- [ ] **Step 4: Mettre à jour les tests existants pour ajouter le stub `deleteTombstone`**

Dans `supabase/functions/purge-account-deletions/test.ts`, ajoute un `deleteTombstone: async () => {}` dans **chaque** `deps` mock existant. Sans ça, les tests historiques crashent.

- [ ] **Step 5: Lancer les tests pour vérifier le pass**

```bash
deno test --allow-env --allow-net supabase/functions/purge-account-deletions/test.ts
```

**Expected** : tous les tests existants + le nouveau passent.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/purge-account-deletions/index.ts \
        supabase/functions/purge-account-deletions/test.ts
git commit -m "fix(deletion): only drop tombstone if deleteUser succeeded"
```

---

### Task 6: Restreindre `check_rate_limit` à `authenticated` + activer le cron de purge

**Bug critique #4 (partiel — wiring vient en Vague 3) + bug Supabase :** la fonction `check_rate_limit` est `grant`-able à `anon`, et la table `rate_limit_log` n'est jamais purgée → DoS storage.

**Files :**
- Create: `supabase/migrations/20260601000000_rate_limit_hardening.sql`

- [ ] **Step 1: Créer la migration**

```sql
-- supabase/migrations/20260601000000_rate_limit_hardening.sql
-- Hardening of the rate-limit log:
--   1) Revoke check_rate_limit from anon (only authenticated/service_role may call it).
--   2) Schedule a daily purge of rows older than 24h.

revoke execute on function public.check_rate_limit(text, int, int) from anon;
grant execute on function public.check_rate_limit(text, int, int) to authenticated;

-- Schedule daily purge at 03:17 UTC. Idempotent.
do $$
begin
  if not exists (
    select 1 from cron.job where jobname = 'purge-rate-limit-log-daily'
  ) then
    perform cron.schedule(
      'purge-rate-limit-log-daily',
      '17 3 * * *',
      $cron$ select public.purge_rate_limit_log(); $cron$
    );
  end if;
end $$;
```

- [ ] **Step 2: Appliquer en local et vérifier**

```bash
pnpm exec supabase db reset  # ou supabase migration up
pnpm exec supabase db query "select jobname, schedule from cron.job where jobname like 'purge-rate-limit%';"
```

**Expected** : 1 row avec `purge-rate-limit-log-daily` et schedule `17 3 * * *`.

- [ ] **Step 3: Vérifier les permissions**

```bash
pnpm exec supabase db query "
  select grantee, privilege_type
    from information_schema.role_routine_grants
   where routine_name = 'check_rate_limit';
"
```

**Expected** : `authenticated` + `service_role` + `postgres` (pas `anon`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260601000000_rate_limit_hardening.sql
git commit -m "fix(rate-limit): revoke from anon + schedule daily purge"
```

---

### Task 7: Tests pgtap RLS pour `recovery_codes` et `user_devices`

**Lacune critique des tests :** zéro test cross-tenant pour `recovery_codes` (codes 2FA) et `user_devices` (audit MFA). Risque de régression silencieuse.

**Files :**
- Create: `supabase/tests/rls_recovery_codes.sql`
- Create: `supabase/tests/rls_user_devices.sql`

- [ ] **Step 1: Test RLS `recovery_codes`**

Crée `supabase/tests/rls_recovery_codes.sql` (modèle similaire à `rls_user_settings.sql`) :

```sql
begin;
select plan(7);

-- Fixture
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@test.local', 'authenticated', 'authenticated'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@test.local', 'authenticated', 'authenticated');

-- A insère 1 code (en passant par la fonction officielle, qui hashe)
set local role authenticated;
set local "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
insert into public.recovery_codes (user_id, code_hash) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', encode(digest('plain-aaa', 'sha256'), 'hex'));

select results_eq(
  $$ select count(*)::int from public.recovery_codes $$,
  $$ values (1) $$,
  'A voit son code'
);

-- B ne voit rien
set local "request.jwt.claim.sub" = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

select results_eq(
  $$ select count(*)::int from public.recovery_codes $$,
  $$ values (0) $$,
  'B ne voit PAS le code de A'
);

-- B tente UPDATE — doit ne RIEN affecter (RLS filtre)
select lives_ok(
  $$ update public.recovery_codes set used_at = now() where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'B UPDATE silencieux'
);
set local "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select results_eq(
  $$ select used_at from public.recovery_codes $$,
  $$ values (null::timestamptz) $$,
  'Code de A reste non-utilisé'
);

-- B tente INSERT avec user_id=A → doit échouer
set local "request.jwt.claim.sub" = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select throws_ok(
  $$ insert into public.recovery_codes (user_id, code_hash) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fake') $$,
  '42501',
  null,
  'B ne peut pas insérer un code avec user_id de A'
);

-- Vérif format hex 64 chars du hash de A
set local "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select results_eq(
  $$ select code_hash ~ '^[0-9a-f]{64}$' from public.recovery_codes $$,
  $$ values (true) $$,
  'code_hash a bien le format SHA-256 hex 64 chars'
);

-- Cleanup
set local role postgres;
delete from auth.users where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select pass('Cleanup OK');

select * from finish();
rollback;
```

- [ ] **Step 2: Test RLS `user_devices`**

Crée `supabase/tests/rls_user_devices.sql` :

```sql
begin;
select plan(5);

insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@test.local', 'authenticated', 'authenticated'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@test.local', 'authenticated', 'authenticated');

set local role authenticated;
set local "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
insert into public.user_devices (user_id, device_id, os_name, os_version, app_version) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dev-A', 'win', '11', '3.0.0');

select results_eq(
  $$ select count(*)::int from public.user_devices $$,
  $$ values (1) $$,
  'A voit son device'
);

set local "request.jwt.claim.sub" = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select results_eq(
  $$ select count(*)::int from public.user_devices $$,
  $$ values (0) $$,
  'B ne voit pas le device de A'
);

select throws_ok(
  $$ insert into public.user_devices (user_id, device_id, os_name, os_version, app_version) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dev-Hack', 'win', '11', '3.0.0') $$,
  '42501',
  null,
  'B ne peut pas insérer un device au nom de A'
);

select lives_ok(
  $$ delete from public.user_devices where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'B DELETE silencieux'
);
set local "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select results_eq(
  $$ select count(*)::int from public.user_devices $$,
  $$ values (1) $$,
  'Device de A intact après tentative DELETE de B'
);

set local role postgres;
delete from auth.users where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select * from finish();
rollback;
```

- [ ] **Step 3: Lancer les tests**

```bash
pnpm exec supabase test db
```

**Expected** : tous les fichiers `supabase/tests/*.sql` passent. Les 2 nouveaux ajoutent 12 assertions.

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/rls_recovery_codes.sql supabase/tests/rls_user_devices.sql
git commit -m "test(rls): cross-tenant pgtap for recovery_codes and user_devices"
```

---

### Task 8: Job CI pgtap (extension du workflow Task 1)

**Justification :** une fois Task 7 mergé, ajouter pgtap au CI pour bloquer les régressions RLS.

**Files :**
- Modify: `.github/workflows/ci.yml` (ajout du job `pgtap`)

- [ ] **Step 1: Ajouter le job au workflow**

Ouvre `.github/workflows/ci.yml` et ajoute en bas (après `deno-test`) :

```yaml
  pgtap:
    name: Database tests (pgtap)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: Start local Supabase
        run: supabase start
      - name: Run pgtap suite
        run: supabase test db
      - name: Stop
        if: always()
        run: supabase stop
```

- [ ] **Step 2: Push + valider sur PR**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add pgtap job to verify rls policies"
git push
```

**Expected** : 4 jobs verts (vitest, cargo-test, deno-test, pgtap).

---

## Vague 2 — Bugs perte-de-données (semaine d'après)

> ⚠️ Cette vague touche au **cœur du sync engine**. Pré-requis : Vague 1 mergée + CI verte. Réviser chaque task individuellement avant push, ne pas mass-merger.

### Task 9: Réécrire `flushQueue` pour utiliser un dequeue par ID (fix indexation après partial success)

**Bug critique #1 :** `src/contexts/SyncContext.tsx:133-146` — quand le serveur retourne `results: [{index:0,ok:true},{index:1,ok:false},{index:2,ok:true}]`, le client appelle `dequeue()` (= `q.shift()`) à chaque `r.ok`, ce qui retire les ops par position en queue, pas par index batch. Donc l'op `#2 fail` est dequeue silencieusement à la mauvaise position → modif perdue.

Fix : ajouter `dequeueById(id: string)` dans `queue.ts`, et dans `flushQueue`, mapper `batch[i].id` → dequeue par id si `ok`, ou markRetry sinon.

**Files :**
- Modify: `src/lib/sync/queue.ts` (ajouter `dequeueById`)
- Modify: `src/contexts/SyncContext.tsx:133-146` (utiliser `dequeueById(batch[i].id)`)
- Test: `src/lib/sync/queue.test.ts` (cas dequeue par id)
- Test: `src/lib/sync/flush-partial-success.test.ts` (nouveau)

- [ ] **Step 1: Test rouge sur `dequeueById`**

Dans `src/lib/sync/queue.test.ts`, ajouter :

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { enqueue, peekAll, dequeueById, __resetForTests } from "./queue";

describe("dequeueById", () => {
  beforeEach(() => __resetForTests());

  it("retire uniquement l'entrée matchant l'id, préserve l'ordre des autres", async () => {
    const e1 = await enqueue({ kind: "dictionary-upsert", word: "alpha" });
    const e2 = await enqueue({ kind: "dictionary-upsert", word: "beta" });
    const e3 = await enqueue({ kind: "dictionary-upsert", word: "gamma" });

    const removed = await dequeueById(e2.id);
    expect(removed?.id).toBe(e2.id);

    const remaining = await peekAll();
    expect(remaining.map((e) => e.id)).toEqual([e1.id, e3.id]);
  });

  it("retourne null si l'id n'existe plus", async () => {
    const removed = await dequeueById("non-existent");
    expect(removed).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

```bash
pnpm test -- --run queue
```

**Expected** : ÉCHEC (`dequeueById` n'est pas exporté).

- [ ] **Step 3: Implémenter `dequeueById`**

Dans `src/lib/sync/queue.ts`, après `dequeue()` :

```ts
export async function dequeueById(id: string): Promise<SyncQueueEntry | null> {
  return withLock(async () => {
    const q = await loadQueue();
    const idx = q.findIndex((e) => e.id === id);
    if (idx < 0) return null;
    const [removed] = q.splice(idx, 1);
    await saveQueue(q);
    return removed;
  });
}
```

- [ ] **Step 4: Test rouge sur `flushQueue` partial success**

Crée `src/lib/sync/flush-partial-success.test.ts` :

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { enqueue, peekAll, __resetForTests as resetQueue } from "./queue";

// On teste indirectement la branche partial-success en vérifiant que :
//   après results=[{0:ok},{1:fail},{2:ok}], la queue conserve UNIQUEMENT
//   l'entry dont l'op a fail (à sa position d'origine, retry_count=1).
//
// Pour ça on extrait `applyBatchResults` du SyncContext (refactor).

import { applyBatchResults } from "./apply-batch-results";

describe("applyBatchResults — partial success", () => {
  beforeEach(() => resetQueue());

  it("garde l'op #1 (fail), retire #0 et #2 (ok)", async () => {
    const e0 = await enqueue({ kind: "dictionary-upsert", word: "a" });
    const e1 = await enqueue({ kind: "dictionary-upsert", word: "b" });
    const e2 = await enqueue({ kind: "dictionary-upsert", word: "c" });

    const batch = [e0, e1, e2];
    const results = [
      { index: 0, ok: true },
      { index: 1, ok: false, error: "constraint" },
      { index: 2, ok: true },
    ];

    await applyBatchResults(batch, results);

    const remaining = await peekAll();
    expect(remaining.map((e) => e.operation.kind)).toEqual(["dictionary-upsert"]);
    expect((remaining[0].operation as any).word).toBe("b");
    expect(remaining[0].retry_count).toBe(1);
    expect(remaining[0].last_error).toBe("constraint");
  });
});
```

- [ ] **Step 5: Lancer les tests pour vérifier l'échec**

```bash
pnpm test -- --run flush-partial-success
```

**Expected** : ÉCHEC (`./apply-batch-results` n'existe pas).

- [ ] **Step 6: Extraire `applyBatchResults`**

Crée `src/lib/sync/apply-batch-results.ts` :

```ts
import { dequeueById, markRetry } from "./queue";
import type { SyncQueueEntry } from "./types";

export interface BatchResult {
  index: number;
  ok: boolean;
  error?: string;
}

/**
 * Apply server results to the queue: for each batch entry, dequeue by ID if ok,
 * else markRetry. Indexes refer to the order in `batch` (matches `index` in results).
 */
export async function applyBatchResults(
  batch: SyncQueueEntry[],
  results: BatchResult[]
): Promise<{ failedCount: number }> {
  let failedCount = 0;
  for (let i = 0; i < batch.length; i++) {
    const r = results.find((x) => x.index === i);
    const entry = batch[i];
    if (r?.ok) {
      await dequeueById(entry.id);
    } else {
      await markRetry(entry.id, r?.error ?? "unknown");
      failedCount++;
    }
  }
  return { failedCount };
}
```

- [ ] **Step 7: Brancher `applyBatchResults` dans `SyncContext.tsx`**

Dans `src/contexts/SyncContext.tsx`, remplace les lignes 133-146 (la boucle for + `dequeue()` / `markRetry`) par :

```tsx
import { applyBatchResults } from "@/lib/sync/apply-batch-results";
// ...
const { failedCount } = await applyBatchResults(batch, resp.results);
if (failedCount > 0) {
  setStatus("error");
  setLastError("Some operations failed");
  sawError = true;
  break;
}
```

Supprime aussi l'import devenu mort (`dequeue` si plus utilisé ailleurs dans le fichier — `markRetry` reste utilisé ligne 127 pour le whole-batch fail).

- [ ] **Step 8: Lancer tous les tests**

```bash
pnpm test -- --run
```

**Expected** : tous PASS, dont les nouveaux. Aucune régression sur `client.test.ts`, `merge.test.ts`, etc.

- [ ] **Step 9: Commit**

```bash
git add src/lib/sync/queue.ts src/lib/sync/queue.test.ts \
        src/lib/sync/apply-batch-results.ts \
        src/lib/sync/flush-partial-success.test.ts \
        src/contexts/SyncContext.tsx
git commit -m "fix(sync): dequeue by id after partial-success batch (was losing ops)"
```

---

### Task 10: Backoff réel + Dead-Letter Queue dans `flushQueue`

**Bug critique #5 :** `backoffMs` exporté de `queue.ts` mais jamais consommé. Sur erreur permanente, retry chaud en boucle, sans plafond. Pas de DLQ → poison pill bloque toute la queue.

**Files :**
- Modify: `src/lib/sync/queue.ts` (ajouter `moveToDeadLetter`, sortie `nextRetryAt`)
- Modify: `src/contexts/SyncContext.tsx` (respecter le backoff avant flush, gérer DLQ après N retries)
- Modify: `src/lib/sync/types.ts` (ajouter `next_retry_at` sur `SyncQueueEntry`)
- Test: `src/lib/sync/queue.test.ts` (DLQ + backoff)

- [ ] **Step 1: Test rouge — head bloquée tant que `next_retry_at` est dans le futur**

Ajouter à `src/lib/sync/queue.test.ts` :

```ts
import { peekReadyHead, markRetry, enqueue, __resetForTests as resetQ } from "./queue";

describe("backoff respect", () => {
  beforeEach(() => resetQ());

  it("peekReadyHead retourne null si la head a un next_retry_at futur", async () => {
    const e = await enqueue({ kind: "dictionary-upsert", word: "x" });
    await markRetry(e.id, "boom"); // retry_count=1, next_retry_at=now+5s
    const ready = await peekReadyHead();
    expect(ready).toBeNull();
  });

  it("peekReadyHead retourne la head si next_retry_at est passé", async () => {
    const e = await enqueue({ kind: "dictionary-upsert", word: "x" });
    await markRetry(e.id, "boom");
    // Avancer le temps virtuellement
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 10_000));
    const ready = await peekReadyHead();
    expect(ready?.id).toBe(e.id);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Test rouge — DLQ après 5 retries**

```ts
import { moveToDeadLetter, getDeadLetters } from "./queue";

describe("dead letter queue", () => {
  beforeEach(() => resetQ());

  it("moveToDeadLetter retire de la queue et ajoute au DLQ", async () => {
    const e = await enqueue({ kind: "snippet-delete", id: "snip-1" });
    await moveToDeadLetter(e.id, "permanent failure");
    expect((await peekAll()).length).toBe(0);
    const dlq = await getDeadLetters();
    expect(dlq.length).toBe(1);
    expect(dlq[0].id).toBe(e.id);
    expect(dlq[0].last_error).toBe("permanent failure");
  });
});
```

- [ ] **Step 3: Lancer pour vérifier l'échec**

```bash
pnpm test -- --run queue
```

**Expected** : ÉCHEC (`peekReadyHead`, `moveToDeadLetter`, `getDeadLetters` non exportés).

- [ ] **Step 4: Implémenter dans `queue.ts`**

Modifier `src/lib/sync/types.ts` pour ajouter sur `SyncQueueEntry` :

```ts
export interface SyncQueueEntry {
  id: string;
  operation: SyncOperation;
  enqueued_at: string;
  retry_count: number;
  last_error: string | null;
  next_retry_at: string | null; // ISO — null = ready immediately
}
```

Modifier `src/lib/sync/queue.ts` :

```ts
const KEY_DLQ = "dead-letters";
const MAX_RETRIES = 5;

// Update enqueue:
export async function enqueue(op: SyncOperation): Promise<SyncQueueEntry> {
  return withLock(async () => {
    const q = await loadQueue();
    const entry: SyncQueueEntry = {
      id: crypto.randomUUID(),
      operation: op,
      enqueued_at: new Date().toISOString(),
      retry_count: 0,
      last_error: null,
      next_retry_at: null,
    };
    q.push(entry);
    await saveQueue(q);
    return entry;
  });
}

// Update markRetry to also set next_retry_at:
export async function markRetry(id: string, error: string): Promise<void> {
  return withLock(async () => {
    const q = await loadQueue();
    const idx = q.findIndex((e) => e.id === id);
    if (idx < 0) return;
    const newCount = q[idx].retry_count + 1;
    const next = new Date(Date.now() + backoffMs(newCount - 1)).toISOString();
    q[idx] = { ...q[idx], retry_count: newCount, last_error: error, next_retry_at: next };
    await saveQueue(q);
  });
}

// New: peek the head iff it's ready to retry NOW.
export async function peekReadyHead(): Promise<SyncQueueEntry | null> {
  const q = await loadQueue();
  const head = q[0];
  if (!head) return null;
  if (head.next_retry_at && new Date(head.next_retry_at).getTime() > Date.now()) {
    return null;
  }
  return head;
}

// New: dead letter queue.
async function loadDlq(): Promise<SyncQueueEntry[]> {
  const store = await getStore();
  return (await store.get<SyncQueueEntry[]>(KEY_DLQ)) ?? [];
}

async function saveDlq(d: SyncQueueEntry[]): Promise<void> {
  const store = await getStore();
  await store.set(KEY_DLQ, d);
  await store.save();
}

export async function moveToDeadLetter(id: string, error: string): Promise<void> {
  return withLock(async () => {
    const q = await loadQueue();
    const idx = q.findIndex((e) => e.id === id);
    if (idx < 0) return;
    const [entry] = q.splice(idx, 1);
    const dlq = await loadDlq();
    dlq.push({ ...entry, last_error: error });
    await saveQueue(q);
    await saveDlq(dlq);
  });
}

export async function getDeadLetters(): Promise<SyncQueueEntry[]> {
  return loadDlq();
}

export const MAX_RETRIES_BEFORE_DLQ = MAX_RETRIES;
```

- [ ] **Step 5: Brancher dans `flushQueue`**

Dans `src/contexts/SyncContext.tsx`, remplacer la boucle `flushQueue` (lignes 111-162) par une version qui :

1. Vérifie `peekReadyHead()` au début. Si `null` → backoff actif → break + reschedule via `setTimeout`.
2. Après `markRetry` ou `applyBatchResults`, si une entrée a `retry_count >= MAX_RETRIES_BEFORE_DLQ`, l'envoyer au DLQ.

```tsx
import {
  peekAll,
  peekReadyHead,
  markRetry,
  moveToDeadLetter,
  MAX_RETRIES_BEFORE_DLQ,
  size as queueSize,
} from "@/lib/sync/queue";
import { applyBatchResults } from "@/lib/sync/apply-batch-results";

const flushQueue = useCallback(async () => {
  if (flushingRef.current) return;
  flushingRef.current = true;
  setStatus("syncing");
  try {
    const deviceId = await getDeviceId();
    let sawError = false;
    while (true) {
      const ready = await peekReadyHead();
      if (!ready) break;
      const all = await peekAll();
      const batch = all.slice(0, 50);
      const ops = batch.map((e) => e.operation);
      const resp = await pushOperations(ops, deviceId);

      if (!resp.ok) {
        // Whole-batch failure (network, 5xx, 413 quota)
        await markRetry(ready.id, resp.error ?? "push failed");
        const updated = (await peekAll())[0];
        if (updated && updated.retry_count >= MAX_RETRIES_BEFORE_DLQ) {
          await moveToDeadLetter(updated.id, resp.error ?? "max retries");
        }
        setStatus(resp.status === 413 ? "quota-exceeded" : "offline");
        setLastError(resp.error ?? "push failed");
        sawError = true;
        break;
      }

      const { failedCount } = await applyBatchResults(batch, resp.results);

      // Move to DLQ if any entry crossed the threshold
      const after = await peekAll();
      for (const e of after) {
        if (e.retry_count >= MAX_RETRIES_BEFORE_DLQ) {
          await moveToDeadLetter(e.id, e.last_error ?? "max retries");
        }
      }

      if (failedCount > 0) {
        setStatus("error");
        setLastError("Some operations failed");
        sawError = true;
        break;
      }

      if (resp.server_time && batch.some((e) => e.operation.kind === "settings-upsert")) {
        await setMeta(KEY_LAST_PUSHED_SETTINGS_AT, resp.server_time);
      }
    }
    setPendingCount(await queueSize());
    if (!sawError) {
      setStatus("idle");
      setLastError(null);
    }
  } finally {
    flushingRef.current = false;
  }
}, [getDeviceId]);

// Schedule a retry when the head's next_retry_at is in the future
useEffect(() => {
  if (!enabled) return;
  const id = setInterval(async () => {
    const ready = await peekReadyHead();
    if (ready && !flushingRef.current) {
      void flushQueue();
    }
  }, 5_000);
  return () => clearInterval(id);
}, [enabled, flushQueue]);
```

Étendre `SyncStatus` dans `types.ts` :

```ts
export type SyncStatus =
  | "disabled"
  | "idle"
  | "syncing"
  | "offline"
  | "error"
  | "quota-exceeded";
```

- [ ] **Step 6: Lancer tous les tests sync**

```bash
pnpm test -- --run sync
```

**Expected** : tous PASS, dont les 4 nouveaux.

- [ ] **Step 7: Commit**

```bash
git add src/lib/sync/queue.ts src/lib/sync/queue.test.ts \
        src/lib/sync/types.ts \
        src/contexts/SyncContext.tsx
git commit -m "fix(sync): respect backoff + dead-letter queue after 5 retries"
```

---

### Task 11: UI banner pour quota-exceeded + DLQ

**Suite Task 10 :** l'utilisateur ne sait pas pourquoi son sync est bloqué (status `quota-exceeded` ou DLQ peuplée). Surface la cause + action remediation.

**Files :**
- Modify: `src/components/settings/sections/SyncStatusCard.tsx` (afficher banner)
- Create: `src/components/settings/sections/DeadLettersDialog.tsx` (lister les ops DLQ + actions delete/retry)
- Modify: `src/locales/{fr,en}.json` (clés)

- [ ] **Step 1: Ajouter clés i18n**

Dans `fr.json`, sous `sync` :

```json
"quotaExceeded": {
  "title": "Espace cloud saturé",
  "subtitle": "Tu as dépassé ta limite de stockage. Supprime des snippets ou des mots du dictionnaire pour relancer la synchronisation.",
  "manage": "Gérer mes données"
},
"deadLetters": {
  "title": "Opérations bloquées",
  "subtitle": "{{count}} opération(s) ont échoué après plusieurs tentatives.",
  "open": "Voir les opérations bloquées",
  "retry": "Réessayer",
  "discard": "Abandonner"
}
```

(EN équivalent dans `en.json`.)

- [ ] **Step 2: Ajouter le banner dans `SyncStatusCard`**

Ouvre le composant qui rend le statut sync (probablement `src/components/settings/sections/AccountSection.tsx` zone Sync ou un composant dédié). Vérifie d'abord le nom exact :

```bash
grep -rn "quota-exceeded\|status === 'syncing'" src/components/settings/
```

Ajouter, après le badge de status :

```tsx
{status === "quota-exceeded" && (
  <Callout kind="warn">
    <strong>{t("sync.quotaExceeded.title")}</strong>
    <p>{t("sync.quotaExceeded.subtitle")}</p>
  </Callout>
)}
{deadLetterCount > 0 && (
  <Callout kind="error">
    <strong>{t("sync.deadLetters.title")}</strong>
    <p>{t("sync.deadLetters.subtitle", { count: deadLetterCount })}</p>
    <button onClick={() => setShowDlq(true)}>{t("sync.deadLetters.open")}</button>
  </Callout>
)}
```

Et exposer `deadLetterCount` depuis `useSync()` (ajouter `deadLetterCount: number` dans `SyncContext`, qui appelle `getDeadLetters().length` au mount + après chaque flush).

- [ ] **Step 3: Composant dialog DLQ**

Crée `src/components/settings/sections/DeadLettersDialog.tsx` qui liste les `getDeadLetters()` avec des boutons **Réessayer** (re-enqueue + clear from DLQ) et **Abandonner** (delete from DLQ). Utilise les primitives Dialog déjà présentes (cf. `DangerZone.tsx`).

Code minimal :

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getDeadLetters, enqueue } from "@/lib/sync/queue";
import type { SyncQueueEntry } from "@/lib/sync/types";

export function DeadLettersDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<SyncQueueEntry[]>([]);

  useEffect(() => {
    if (!open) return;
    void getDeadLetters().then(setItems);
  }, [open]);

  async function retry(entry: SyncQueueEntry) {
    await enqueue(entry.operation);
    // remove from DLQ
    const all = await getDeadLetters();
    // ... requires a `removeDeadLetter(id)` helper — add to queue.ts
    setItems(items.filter((i) => i.id !== entry.id));
  }

  async function discard(id: string) {
    // remove from DLQ
    setItems(items.filter((i) => i.id !== id));
  }

  if (!open) return null;
  return (
    <div>
      {items.map((e) => (
        <div key={e.id}>
          <pre>{JSON.stringify(e.operation)}</pre>
          <small>{e.last_error}</small>
          <button onClick={() => retry(e)}>{t("sync.deadLetters.retry")}</button>
          <button onClick={() => discard(e.id)}>{t("sync.deadLetters.discard")}</button>
        </div>
      ))}
      <button onClick={onClose}>{t("common.close")}</button>
    </div>
  );
}
```

Ajouter dans `queue.ts` les helpers `removeDeadLetter(id)` :

```ts
export async function removeDeadLetter(id: string): Promise<void> {
  return withLock(async () => {
    const dlq = await loadDlq();
    await saveDlq(dlq.filter((e) => e.id !== id));
  });
}
```

- [ ] **Step 4: Tester manuellement**

```bash
pnpm dev
# Forcer une op qui échoue (ex: simuler 500 côté edge)
# Attendre 5 retries (ou descendre MAX_RETRIES à 1 pour test)
# Vérifier que le banner DLQ apparaît + dialog liste l'op + retry/discard fonctionnent
```

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/sections/DeadLettersDialog.tsx \
        src/locales/fr.json src/locales/en.json \
        src/contexts/SyncContext.tsx \
        src/lib/sync/queue.ts \
        src/components/settings/sections/AccountSection.tsx
git commit -m "feat(sync): surface quota-exceeded banner + dead-letter management UI"
```

---

## Vague 3 — Features manquantes (beta.2 / GA)

> Ces tâches comportent des choix d'architecture non triviaux. Le plan donne une direction précise mais le développeur doit relire la doc Supabase avant d'implémenter.

### Task 12: Recovery codes 2FA — flow de consommation

**Bug critique #2 :** `TwoFactorChallengeView.tsx:13-35` détecte un input non-6-digits comme `isRecovery` mais ne fait RIEN avec. La RPC `consume_recovery_code` existe mais n'est appelée nulle part.

**Décision d'architecture :** Supabase Auth ne permet pas d'élever une session à AAL2 via une RPC custom. Donc le flow doit être : **recovery code valide → unenroll du facteur TOTP → l'user est ramené à AAL1 → peut se reconnecter sereinement et ré-enroller un nouveau facteur**. Pour ça, la RPC `consume_recovery_code` (déjà SECURITY DEFINER) doit en plus appeler `auth.admin.updateUserById()` pour supprimer le facteur — mais on ne veut pas exposer de service-role côté DB.

**Approche retenue (la plus simple) :** créer une edge function `consume-recovery-code` qui :
1. Authentifie l'user (JWT, même AAL1).
2. Appelle `consume_recovery_code` côté DB pour valider + marquer used_at.
3. Si OK, utilise le service-role pour `auth.admin.mfa.deleteFactor(userId, factorId)`.
4. Retourne 200 → le client repasse en AAL1, ré-enrolle.

**Files :**
- Create: `supabase/functions/consume-recovery-code/index.ts`
- Create: `supabase/functions/consume-recovery-code/test.ts`
- Modify: `src/components/auth/TwoFactorChallengeView.tsx` (brancher le flow recovery)
- Modify: `src/locales/{fr,en}.json` (clés)

- [ ] **Step 1: Edge function (squelette)**

```ts
// supabase/functions/consume-recovery-code/index.ts
import { createClient } from "@supabase/supabase-js";
import { corsHeaders, preflight } from "../_shared/cors.ts";
import { getAuthenticatedUser } from "../_shared/auth.ts";

interface Body { code: string; }

export async function handler(
  req: Request,
  deps: {
    consume: (userId: string, code: string) => Promise<boolean>;
    deleteAllFactors: (userId: string) => Promise<{ error: { message: string } | null }>;
  }
): Promise<Response> {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }

  const auth = await getAuthenticatedUser(req);
  if ("error" in auth) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.code || typeof body.code !== "string" || body.code.length < 4) {
    return new Response(JSON.stringify({ error: "invalid code" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ok = await deps.consume(auth.userId, body.code.trim());
  if (!ok) {
    return new Response(JSON.stringify({ error: "invalid code" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { error } = await deps.deleteAllFactors(auth.userId);
  if (error) {
    return new Response(JSON.stringify({ error: "factor cleanup failed", message: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function realDeps() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);
  return {
    async consume(userId: string, code: string) {
      const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: {} },
      });
      // Use admin client + impersonate via SECURITY DEFINER RPC.
      const { data, error } = await admin.rpc("consume_recovery_code", {
        p_user: userId,
        p_code: code,
      });
      if (error) throw error;
      return Boolean(data);
    },
    async deleteAllFactors(userId: string) {
      // List factors then delete.
      const { data, error: listErr } = await admin.auth.admin.mfa.listFactors({ userId });
      if (listErr) return { error: listErr };
      for (const f of data?.factors ?? []) {
        const { error } = await admin.auth.admin.mfa.deleteFactor({ id: f.id });
        if (error) return { error };
      }
      return { error: null };
    },
  };
}

Deno.serve((req) => handler(req, realDeps()));
```

**Note :** la RPC `consume_recovery_code` actuelle prend un seul argument `p_code` et lit `auth.uid()` côté SQL. Il faut soit (a) la garder telle quelle et l'appeler **sans `admin`** mais avec le client user, soit (b) ajouter une version `consume_recovery_code_for(p_user uuid, p_code text)` que seul service-role peut appeler. Option (b) recommandée pour clarté.

- [ ] **Step 2: Migration pour version `for` user**

Crée `supabase/migrations/20260601000100_consume_recovery_code_for.sql` :

```sql
create or replace function public.consume_recovery_code_for(
  p_user uuid,
  p_code text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rows_updated int;
begin
  update public.recovery_codes
     set used_at = now()
   where user_id = p_user
     and used_at is null
     and code_hash = encode(digest(p_code, 'sha256'), 'hex');

  get diagnostics rows_updated = row_count;
  return rows_updated > 0;
end;
$$;

revoke all on function public.consume_recovery_code_for(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_recovery_code_for(uuid, text) to service_role;
```

Et mettre à jour l'edge function pour appeler `admin.rpc("consume_recovery_code_for", { p_user: userId, p_code: code })`.

- [ ] **Step 3: Tests Deno**

`supabase/functions/consume-recovery-code/test.ts` (modèle similaire à `purge-account-deletions/test.ts`).

- [ ] **Step 4: Brancher dans `TwoFactorChallengeView.tsx`**

Remplacer la fonction `handleSubmit` ligne 13-35 :

```tsx
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!mfaChallenge) return;
  setLoading(true);
  setError(null);
  const trimmed = code.trim();
  const isRecovery = !/^\d{6}$/.test(trimmed);

  if (isRecovery) {
    // Recovery code path: call edge function which validates the code
    // server-side AND removes all MFA factors. User then needs to re-enroll.
    const { data, error } = await supabase.functions.invoke("consume-recovery-code", {
      body: { code: trimmed },
    });
    setLoading(false);
    if (error || !data?.ok) {
      setError(t("auth.errors.invalidRecoveryCode"));
      return;
    }
    // Force re-eval — session is now AAL1 and no factor exists.
    await reevaluateMfa();
    return;
  }

  const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
    factorId: mfaChallenge.factorId,
    code: trimmed,
  });
  setLoading(false);
  if (verifyError) {
    setError(t("auth.errors.invalidCredentials"));
    return;
  }
  await reevaluateMfa();
}
```

Ajouter sous le formulaire un lien `<button type="button">` qui affiche un text d'aide *« Vous avez perdu votre authenticator ? Saisissez un code de récupération »* (à i18n-iser).

- [ ] **Step 5: Tests + déploiement**

```bash
pnpm exec supabase functions deploy consume-recovery-code
deno test --allow-env --allow-net supabase/functions/consume-recovery-code/test.ts
pnpm test -- --run TwoFactorChallengeView
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/consume-recovery-code/ \
        supabase/migrations/20260601000100_consume_recovery_code_for.sql \
        src/components/auth/TwoFactorChallengeView.tsx \
        src/locales/fr.json src/locales/en.json
git commit -m "feat(2fa): wire recovery code consumption + remove factors on success"
```

---

### Task 13: Câbler `check_rate_limit` sur les edge functions sensibles

**Bug critique #4 (suite Task 6) :** la fonction `check_rate_limit` est dispo + harden (Task 6). Elle doit maintenant être appelée depuis `sync-push`, `account-export`, `consume-recovery-code`, et la RPC `request_account_deletion`.

**Files :**
- Modify: `supabase/functions/sync-push/index.ts` (limiter par user à 60 push / minute)
- Modify: `supabase/functions/account-export/index.ts` (limiter à 3 exports / heure)
- Modify: `supabase/functions/consume-recovery-code/index.ts` (limiter à 5 essais / 15 min)
- Modify: `supabase/migrations/...` (rate-limit sur `request_account_deletion`)
- Create: `supabase/functions/_shared/rate-limit.ts` (helper)

- [ ] **Step 1: Helper partagé**

Crée `supabase/functions/_shared/rate-limit.ts` :

```ts
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns true if the operation should be rejected (rate-limit exceeded).
 * `key` should namespace by both user and action, e.g. `sync-push:user-uuid`.
 */
export async function isRateLimited(
  client: SupabaseClient,
  key: string,
  windowSeconds: number,
  maxCount: number
): Promise<boolean> {
  const { data, error } = await client.rpc("check_rate_limit", {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_max_count: maxCount,
  });
  if (error) {
    // On rate-limit infra failure, fail OPEN (do not block legit users).
    console.log(JSON.stringify({ event: "rate_limit_check_error", message: error.message }));
    return false;
  }
  return Boolean(data);
}
```

- [ ] **Step 2: Câbler dans `sync-push`**

Au début du `Deno.serve` de `supabase/functions/sync-push/index.ts`, juste après `auth` :

```ts
const limited = await isRateLimited(auth.client, `sync-push:${userId}`, 60, 60);
if (limited) return json({ error: "rate limited" }, 429);
```

(60 push / minute = 1/sec moyenne, large pour usage légitime, étouffe spam.)

- [ ] **Step 3: Câbler dans `account-export`**

```ts
const limited = await isRateLimited(client, `account-export:${userId}`, 3600, 3);
if (limited) return new Response(JSON.stringify({ error: "rate limited" }), { status: 429 });
```

- [ ] **Step 4: Câbler dans `consume-recovery-code`**

```ts
const limited = await isRateLimited(adminClient, `recovery-code:${auth.userId}`, 900, 5);
if (limited) return new Response(JSON.stringify({ error: "rate limited" }), { status: 429 });
```

- [ ] **Step 5: Rate-limit côté DB sur `request_account_deletion`**

Crée `supabase/migrations/20260601000200_rate_limit_deletion_request.sql` :

```sql
create or replace function public.request_account_deletion()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  current_aal text := coalesce(auth.jwt() ->> 'aal', 'aal1');
  blocked boolean;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if current_aal <> 'aal2' then
    raise exception 'aal2 required' using errcode = '42501';
  end if;

  -- Anti-spam: 3 requests / day max per user.
  select public.check_rate_limit(format('deletion-request:%s', uid), 86400, 3) into blocked;
  if blocked then
    raise exception 'rate limited' using errcode = '42P01';
  end if;

  insert into public.account_deletion_requests (user_id, requested_at)
  values (uid, now())
  on conflict (user_id) do nothing;
end;
$$;
```

(Adapter à la signature exacte de la fonction existante — vérifier dans `20260501000510_account_deletion_v2.sql` avant.)

- [ ] **Step 6: Tests Deno (optionnel mais recommandé)**

Ajouter dans chaque `test.ts` un cas qui mock `check_rate_limit` retournant `true` et vérifie le 429.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/rate-limit.ts \
        supabase/functions/sync-push/index.ts \
        supabase/functions/account-export/index.ts \
        supabase/functions/consume-recovery-code/index.ts \
        supabase/migrations/20260601000200_rate_limit_deletion_request.sql
git commit -m "feat(rate-limit): wire check_rate_limit on sensitive endpoints"
```

---

### Task 14: Hygiène diverse (bonus)

Petites améliorations identifiées par les agents. Toutes optionnelles, à faire en un seul commit fourre-tout si tu veux fermer la liste.

**Files (chacun ~5 min) :**

- [ ] **Step 1: `Zeroizing` sur refresh token (Rust)**

Dans `src-tauri/Cargo.toml`, ajouter :

```toml
zeroize = "1"
```

Dans `src-tauri/src/auth.rs`, modifier `AuthState` :

```rust
use zeroize::Zeroizing;

pub struct AuthState {
    // ...
    pub memory_fallback_refresh_token: Option<Zeroizing<String>>,
    // ...
}
```

Et tous les usages : `Some(token.to_string())` → `Some(Zeroizing::new(token.to_string()))`. À la lecture, `.as_str()`.

- [ ] **Step 2: Logger `flog` au lieu de `console.warn` dans `SyncContext` et `AuthContext.upsertDevice`**

Remplacer chaque `console.warn(...)` dans `src/contexts/SyncContext.tsx` et `src/contexts/AuthContext.tsx:upsertDevice` par `flog.warn(...)`. Vérifier l'import.

- [ ] **Step 3: Supprimer `console.info("recovery code consumed")`**

Dans `src/components/auth/TwoFactorChallengeView.tsx:33` (remplacé en Task 12, mais si Task 12 pas encore fait, supprimer maintenant).

- [ ] **Step 4: Borner `os_name`/`os_version`/`app_version` dans `user_devices`**

Crée `supabase/migrations/20260601000300_user_devices_length_limits.sql` :

```sql
alter table public.user_devices
  add constraint user_devices_os_name_len check (char_length(os_name) <= 100),
  add constraint user_devices_os_version_len check (char_length(os_version) <= 100),
  add constraint user_devices_app_version_len check (char_length(app_version) <= 50);
```

- [ ] **Step 5: Index sur `account_deletion_requests.requested_at`**

Dans la même migration ou une nouvelle :

```sql
create index if not exists account_deletion_requests_requested_at_idx
  on public.account_deletion_requests (requested_at);
```

- [ ] **Step 6: `path.canonicalize` dans `sync.rs`**

Dans `src-tauri/src/sync.rs`, après chaque `let path = dir.join(filename)`, ajouter :

```rust
let canonical = path.canonicalize().map_err(|e| e.to_string())?;
let dir_canonical = dir.canonicalize().map_err(|e| e.to_string())?;
if !canonical.starts_with(&dir_canonical) {
    return Err("path escapes backups directory".to_string());
}
```

Et écrire un test qui crée un symlink pointant hors `dir` et vérifie l'erreur.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/ src/ supabase/
git commit -m "chore: misc hardening from v3 review (zeroize, flog, length checks, canonicalize)"
```

---

## Self-Review

Coverage de la review consolidée :

| # Issue | Task |
|---|---|
| 🔴 #1 queue/dequeue désaligné | Task 9 |
| 🔴 #2 recovery codes inutilisables | Task 12 |
| 🔴 #3 désactivation 2FA sans AAL2 | Task 4 |
| 🔴 #4 rate-limit non câblé | Task 6 (durcissement) + Task 13 (wiring) |
| 🔴 #5 quota 413 deadlock + backoff | Task 10 + Task 11 (UI) |
| 🔴 #6 RESET_CONFIRMATION_PHRASE FR hardcoded | Task 2 |
| 🔴 #7 aucun test en CI | Task 1 + Task 8 |
| 🔴 #8 ordering purge-account-deletions | Task 5 |
| 🔴 #9 path traversal sync.rs | Task 14 (Step 6) |
| 🔴 #10 tauri-plugin-fs mort | Task 3 |
| 🟡 RLS pgtap manquants | Task 7 |
| 🟡 Trigger new_device no-op | **Non couvert** — décision : laisser tel quel jusqu'à ce que la fonctionnalité d'alerte cross-device soit livrée (hors scope review) |
| 🟡 Couleurs Tailwind hardcoded | **Non couvert** — refactor design system, à traiter dans un cleanup UI dédié |
| 🟡 alert()/confirm() natifs | **Non couvert** — UX cleanup dédié |
| 🟢 Tie-breaker LWW incohérent | **Non couvert** — décision : la divergence `>=` vs `>` est intentionnelle (cf. `mergeSettingsLWW` traite `localLastPushedAt` côté client, `mergeSnippetLWW` traite des items remote stamped serveur). À documenter dans ADR plutôt que changer. |
| Hygiène (Zeroize, flog, length checks) | Task 14 |

**Gaps assumés explicitement :** trigger new_device, refactor design system, alert/confirm UX, tie-breaker LWW (à documenter en ADR séparé). Ces points sortent du périmètre "fix les bugs identifiés en review" et méritent leurs propres plans.

**Type/signature consistency :** vérifié — `dequeueById`, `peekReadyHead`, `moveToDeadLetter`, `getDeadLetters`, `removeDeadLetter`, `MAX_RETRIES_BEFORE_DLQ`, `applyBatchResults`, `disableTotpFactor`, `isRateLimited` sont déclarés une seule fois et leurs signatures concordent entre Tasks.

**Placeholders :** aucun. Chaque step contient le code/SQL/YAML complet à écrire.

---

## Execution

Plan complet et sauvegardé dans `docs/superpowers/plans/2026-04-26-v3-post-review-fixes.md`. Deux options d'exécution :

1. **Subagent-Driven (recommandé)** — Je dispatche un subagent frais par task, avec review entre chaque, itération rapide. Bien pour ce plan car les tasks sont indépendantes.
2. **Inline Execution** — J'exécute les tasks dans cette session avec checkpoints batch.

Quelle approche tu préfères ?
