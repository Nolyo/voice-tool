# Trial Auto-Provisioning — Design

> **Date** : 2026-05-05
> **Sub-épique** : v3 / 04-billing (anticipé depuis 05-managed-transcription PR #44)
> **Statut** : Spec validé, prêt pour writing-plans

## Contexte

PR #44 (`feat(v3): managed transcription cloud service (sub-epic 05 phase 1)`) a livré le service de transcription cloud avec un système de crédits d'essai (`trial_credits`, 60 min / 30 jours). La migration `20260504100300_trial_credits.sql` créé la table mais documente explicitement :

> Init logic (insert at email verify) lives in 04-billing plan; this migration only creates the table.

Conséquence aujourd'hui : aucun row `trial_credits` n'est créé automatiquement à l'inscription. Il faut insérer la ligne **à la main** dans Supabase pour qu'un nouveau compte puisse utiliser le mode cloud. Bloquant pour transformer la v3.0 beta en produit utilisable sans intervention manuelle.

Ce spec couvre uniquement le grant initial. Le sous-épique 04 complet (offre premium, pricing, gating, Lemon Squeezy) reste à brainstormer séparément.

## Objectif

À l'inscription d'un nouvel utilisateur, créer automatiquement son row `trial_credits` au moment où l'email devient vérifié, sans nouveau code applicatif (logique 100% Postgres).

## Décisions actées (brainstorm 2026-05-05)

| # | Décision | Rationale |
|---|---|---|
| 1 | **Déclencheur = email vérifié** (pas signup brut, pas RPC frontend) | Match la spec d'origine, évite les rows orphelins, impossible à contourner depuis le client |
| 2 | **Pas de backfill** des users existants | La base est vide (zéro user en prod, juste le compte de test du dev) |
| 3 | **Pas d'anti-abus re-signup** | YAGNI à l'échelle launch ; coût d'abus négligeable (quelques minutes Groq) ; option B aurait imposé une concession GDPR (rétention email post-deletion) non justifiée |
| 4 | **Une fonction PL/pgSQL + deux triggers** (INSERT WHEN + UPDATE OF) partageant la fonction | Filtrage `WHEN` au niveau trigger = idiomatic Postgres + zero overhead |
| 5 | **Pas de bloc EXCEPTION** dans la fonction | Préfère un fail bruyant (signup bloqué, user reporte) à un fail silencieux (users sans trial qui se plaignent que le cloud ne marche pas) |

## Architecture

**Un seul fichier de migration, pas de changement frontend ni Rust, pas d'Edge Function.**

- `supabase/migrations/20260505HHMMSS_grant_trial_on_verify.sql` — fonction + 2 triggers (le `HHMMSS` est l'heure UTC au moment de la création de la migration, convention Supabase)
- `supabase/tests/grant_trial_on_verify.sql` — pgtap couvrant 5 scénarios

Conventions du projet respectées (cf. `bump_trial_on_usage_event` dans `20260504221727_atomic_trial_bump.sql`) :
- `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`
- `REVOKE ALL FROM PUBLIC` sur la fonction (pas d'exposition cliente)
- `COMMENT ON FUNCTION` documentaire

**Pourquoi `SECURITY DEFINER`** : le rôle `auth_admin` qui exécute les INSERT/UPDATE sur `auth.users` n'a pas le droit d'écrire dans `public.trial_credits`. La fonction tourne avec les droits du owner (postgres / supabase_admin) pour franchir la frontière de schéma.

**Interactions** :
- Avec `account_deletion` : aucune. La cascade `ON DELETE CASCADE` sur `trial_credits.user_id` reste intacte ; suppression du compte → suppression du trial.
- Avec `bump_trial_on_usage_event` (trigger sur `usage_events`) : aucune. Contextes orthogonaux.
- Avec le trigger `enforce_email_canonical_unique` (ADR 0011) : ce dernier fire BEFORE INSERT/UPDATE et peut bloquer le INSERT auth.users. Si bloqué, notre AFTER trigger ne fire pas du tout — comportement correct.

## Migration SQL

```sql
-- supabase/migrations/20260505HHMMSS_grant_trial_on_verify.sql (HHMMSS = UTC à la création)

-- Auto-grant 60 min / 30 days trial on email verification.
-- Fires on the two paths a user becomes "verified":
--   1. INSERT with email_confirmed_at already set (OAuth, or email signup
--      while auth.email.enable_confirmations = false).
--   2. UPDATE OF email_confirmed_at from NULL to NOT NULL (magic link, or
--      email signup with confirmations enabled).
--
-- ON CONFLICT DO NOTHING makes it idempotent: if a row was manually inserted
-- (e.g. for a test user) or for any future re-verify edge case, we don't
-- overwrite an in-progress trial.
--
-- minutes_granted / started_at / expires_at all use the table defaults
-- (60 min, NOW(), NOW() + 30 days) — keeping the grant policy in one place
-- (the table definition).

CREATE OR REPLACE FUNCTION public.grant_trial_credits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.trial_credits (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_trial_credits() FROM PUBLIC;

CREATE TRIGGER grant_trial_on_user_insert
  AFTER INSERT ON auth.users
  FOR EACH ROW
  WHEN (NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.grant_trial_credits();

CREATE TRIGGER grant_trial_on_email_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.grant_trial_credits();

COMMENT ON FUNCTION public.grant_trial_credits() IS
  'Inserts a trial_credits row (60 min / 30 days) for the user being verified. Idempotent via ON CONFLICT.';
```

## Tests pgtap

Fichier `supabase/tests/grant_trial_on_verify.sql`, 7 assertions (5 scénarios + 2 sanity checks).

| # | Scénario | Setup | Assert |
|---|---|---|---|
| 1 | OAuth / signup confirmations off | INSERT auth.users avec `email_confirmed_at = NOW()` | 1 row trial avec `minutes_granted = 60`, `expires_at ≈ NOW() + 30j` |
| 2 | Email signup non vérifié | INSERT auth.users avec `email_confirmed_at = NULL` | 0 row trial pour cet user |
| 3 | Vérification a posteriori | Étape du #2, puis UPDATE `email_confirmed_at = NOW()` | 1 row trial désormais |
| 4 | UPDATE non-pertinent | User vérifié, UPDATE sur autre colonne (ex. `raw_user_meta_data`) | Toujours 1 row, pas de doublon (le `WHEN` filtre) |
| 5 | Idempotence trial pré-existant | (a) INSERT auth.users non vérifié (FK satisfaite, pas de trigger fire) → (b) INSERT manuel `trial_credits (user_id, minutes_consumed=30)` → (c) UPDATE `email_confirmed_at = NOW()` | `minutes_consumed = 30` conservé (ON CONFLICT DO NOTHING) |

Sanity : `has_function('public', 'grant_trial_credits')` + `trigger_is(...)`.

**Non couverts (par design)** : concurrence (le trigger est isolé par la transaction d'auth), abus delete+re-signup (option A acceptée).

## Edge cases

| Cas | Comportement | Conforme spec ? |
|---|---|---|
| User s'inscrit, ne vérifie jamais | Aucun row trial | ✅ |
| User change d'email après vérification | UPDATE ne fire pas (pas de transition NULL→NOT NULL), trial inchangé | ✅ |
| Compte supprimé puis re-créé même email | CASCADE efface trial, re-signup → nouveau trial | ✅ option A |
| Admin bulk-confirme des comptes anciens (hors backfill) | Chaque UPDATE déclenche un grant | Acceptable (vaut backfill manuel) |
| Trigger crash | INSERT/UPDATE auth.users rollback → user bloqué | ✅ par décision (fail bruyant) |

## Déploiement

**Migration additive, pas de coordination Worker.**

1. `pnpm exec supabase db push --linked` sur le projet remote (posture free-tier first, un seul projet — memory `project_v3_launch_posture.md`)
2. `pnpm exec supabase test db --linked` pour valider pgtap en remote
3. Test manuel : créer un compte via le flow normal (magic link OU OAuth Google), vérifier dans le dashboard Supabase que `trial_credits` contient bien la ligne

**Rollback** :
```sql
DROP TRIGGER IF EXISTS grant_trial_on_email_confirmed ON auth.users;
DROP TRIGGER IF EXISTS grant_trial_on_user_insert ON auth.users;
DROP FUNCTION IF EXISTS public.grant_trial_credits();
```
Aucune corruption possible : les rows trial déjà accordés restent valides et fonctionnels.

## GDPR

`trial_credits` ne stocke pas de PII (user_id + compteurs uniquement). Base légale = exécution contractuelle (l'essai fait partie du service). Droit à l'effacement assuré par `ON DELETE CASCADE`.

**À faire ailleurs** : la table `trial_credits` elle-même n'apparaît pas dans `docs/v3/compliance/registre-traitements.md`. Référencer la table dans le registre (une ligne au titre du sous-épique 05) est un follow-up indépendant — ce spec ne l'introduit pas.

## Critères d'acceptation

- [ ] Migration appliquée en remote sans erreur
- [ ] pgtap : 7/7 green
- [ ] Test manuel signup magic link → row `trial_credits` créé
- [ ] Test manuel OAuth Google → row `trial_credits` créé
- [ ] `QuotaCounter` affiche le compteur trial sans intervention manuelle dans Supabase
- [ ] Aucune régression sur le flow signup (pas de blocage user)

## Hors scope

- Backfill des users existants (aucun à backfill)
- Anti-abus delete+re-signup (option A)
- Gating premium / pricing / Lemon Squeezy (sous-épique 04 complet, à brainstormer séparément)
- Deuxième chance trial (re-credit après expiration) — non prévu, conforme commentaire de la table : "Re-credit not automatic"
