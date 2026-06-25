# Partage public de notes — lien live

**Date :** 2026-06-25
**Statut :** design validé (direction approuvée par l'utilisateur, décisions par défaut listées §9)
**Sous-épique :** v3 / partage (nouvelle)

## 1. Problème

Un utilisateur rédige des tutos (notes riches avec images) dans Lexena et veut les
partager à des collègues qui **n'ont pas l'application** et qu'on **ne veut pas forcer**
à l'installer. Le copier-coller actuel perd les images (elles ne sont pas réellement
recopiées hors de l'app).

## 2. Contraintes existantes exploitées

- Une note est du **HTML autonome** : l'éditeur TipTap stocke les images en **base64
  inline** dans `content_html` (`src/hooks/useNotesEditorInstance.ts:252`, paste/drop →
  data URI). Aucune pièce jointe séparée à gérer.
- La note est déjà répliquée côté serveur dans `user_notes` par la **sync** (sous-épique
  03). Hard cap 1 MB par note (`octet_length(content_html) <= 1048576`).
- Pattern Edge Function anonyme déjà en place : `demo-transcribe` (`verify_jwt = false`,
  `supabase/config.toml`).
- Marketing site déployé sur Cloudflare Pages (cf. repo callback auth). `lexena.app`.

## 3. Décisions produit (validées en brainstorming)

- **Lien web public** (pas un fichier autonome). URL `lexena.app/s/<slug>`.
- **Live** : le lien reflète toujours la dernière version **synchronisée** de la note.
  → Conséquence assumée : **partager exige que la sync soit active** (la note doit être
  dans `user_notes`). Risque de brouillon exposé accepté par l'utilisateur.
- **Contrôle du lien** : révocation + panneau « Mes liens partagés ».
  Pas d'expiration, pas de mot de passe (MVP).

## 4. Architecture

```
┌────────────── App Lexena (Tauri) ──────────────┐
│ Éditeur de note → bouton « Partager »           │
│   - si sync OFF → CTA active la sync            │
│   - supabase-js (RLS owner) : create/revoke/list│
│   - slug crypto base62 (~95 bits)               │
└───────────────┬─────────────────────────────────┘
                │ insert/update note_shares (RLS)
                ▼
        ┌───────────────────┐        ┌──────────────────┐
        │ note_shares (RLS)  │        │ user_notes (RLS) │
        │ slug, note_id,…    │── note_id ─►│ content_html │
        └─────────┬──────────┘        └──────────────────┘
                  │ service role (bypass RLS), actif + non supprimé
                  ▼
        ┌───────────────────────────────┐
        │ Edge Function share-view      │  verify_jwt = false
        │  slug → { title, contentHtml, │
        │           updatedAt } | 404   │
        └─────────┬─────────────────────┘
                  │ HTTPS (CORS lexena.app)
                  ▼
        ┌───────────────────────────────┐
        │ Page publique lexena.app/s/<slug> (Cloudflare Pages) │
        │  - DOMPurify (sanitize XSS)   │
        │  - flatten wiki-links [[..]]  │
        │  - rendu brandé + CSP stricte │
        └───────────────────────────────┘
```

## 5. Modèle de données — `note_shares`

```sql
create table public.note_shares (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null references public.user_notes(id) on delete cascade,
  title_snapshot text not null default '',
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- Un seul partage actif par note.
create unique index note_shares_one_active_per_note
  on public.note_shares (note_id) where revoked_at is null;

create index note_shares_user_active_idx
  on public.note_shares (user_id) where revoked_at is null;

alter table public.note_shares enable row level security;
create policy note_shares_select_own on public.note_shares for select using (auth.uid() = user_id);
create policy note_shares_insert_own on public.note_shares for insert with check (auth.uid() = user_id);
create policy note_shares_update_own on public.note_shares for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy note_shares_delete_own on public.note_shares for delete using (auth.uid() = user_id);
```

- Lecture publique **hors RLS** : uniquement via l'Edge Function en service role.
- **Révocation** = `update set revoked_at = now()`. Re-partage = **nouveau slug**
  (nouvelle ligne ; l'ancienne URL reste morte à jamais).
- `title_snapshot` rafraîchi à chaque (re)partage pour alimenter le panneau « Mes liens »
  sans dépendre d'un join ni d'un pull à jour.
- Migration : nom timestamp réel `YYYYMMDDHHMMSS_note_shares.sql`.

## 6. Edge Function `share-view`

- `verify_jwt = false` (déclaré dans `supabase/config.toml`), service role.
- Entrée : `slug` (query `?s=` ou body). Validation format strict (base62, longueur).
- Logique : `note_shares` actif (`revoked_at is null`) pour le slug → join `user_notes`
  (`id = note_id` **et** `user_id = share.user_id` **et** `deleted_at is null`).
  - introuvable / révoqué / note supprimée → **404** (message neutre, pas de distinction
    pour éviter l'oracle d'énumération).
  - sinon → `{ title, contentHtml, updatedAt }`.
- **Ne renvoie jamais** `user_id`, email, ni d'autres notes.
- Rate-limit IP léger (réutiliser le pattern `rate_limit_log`) anti-scraping. Le slug
  imprévisible rend l'énumération impraticable, le rate-limit est une défense en profondeur.
- CORS : origine `lexena.app` (+ `localhost` en dev).

## 7. Page publique (Cloudflare Pages)

- Route `lexena.app/s/<slug>` (repo marketing site, séparé).
- Récupère le contenu via `share-view`, puis **côté navigateur** :
  1. **DOMPurify** sur `contentHtml` — autorise `img` (data: base64) et le markup de base,
     supprime `script`, handlers `on*`, `javascript:`, iframes.
  2. **Aplatit les wiki-links** : les nœuds `[[note]]` (attributs `data-note-link` /
     custom TipTap) → `<span>` texte non cliquable (la note cible n'est pas partagée).
  3. Rend dans un layout brandé Lexena (c'est la vitrine pour des non-utilisateurs) avec
     un CTA discret « Créé avec Lexena ».
- **CSP stricte** : `script-src 'self'` (aucun script issu du contenu note), `img-src 'self' data:`.
- États : chargement, 404 (« Ce lien n'existe plus ou a été désactivé »), erreur réseau.

## 8. App — frontend

- **Module `src/lib/sharing/`** : `createShare(noteId)`, `revokeShare(shareId)`,
  `listShares()`, `getShareUrl(slug)`, `generateSlug()` (crypto, base62, 16 car.).
  Appels supabase-js directs (protégés RLS). Pas d'Edge Function pour les mutations owner.
- **Action « Partager »** dans l'en-tête de l'éditeur
  (`NotesEditorHeader.tsx` / `NotesEditorTitleBar.tsx`) → popover :
  - sync inactive → message + CTA « Active la synchronisation pour partager ».
  - non partagée → bouton « Créer un lien ».
  - partagée → URL + « Copier » + « Arrêter le partage ». Mention « Le lien montre
    toujours la dernière version synchronisée ».
- **Panneau « Mes liens partagés »** (Settings → `AccountSection`, visible signed-in) :
  liste (`title_snapshot`, URL, date), « Copier », « Révoquer ».
- **i18n** : toutes les strings via react-i18next (y compris title/aria-label).
- État : un hook `useNoteShares` (liste + mutations), éventuel contexte si réutilisé.

## 9. Décisions par défaut (révocables)

1. **Pas de paywall** au MVP : partage dispo sur tous les plans tant que la sync est
   active (posture free-tier first). Plafond de liens actifs envisageable plus tard.
2. **Wiki-links aplatis** en texte sur la page publique (pas de partage transitif).
3. **Un lien actif par note** ; révoquer puis re-partager → **nouveau slug**.
4. **Pas d'expiration ni mot de passe** (MVP).

## 10. Sécurité — récapitulatif

- Slug imprévisible ~95 bits ; URL révoquée morte définitivement (nouveau slug au re-partage).
- **Sanitization DOMPurify obligatoire** sur la page publique (contenu note = HTML arbitraire
  servi sur le domaine → risque XSS / vol de session).
- Edge service-role : ne renvoie que la note partagée active + non supprimée, rien d'autre.
- Rate-limit IP sur `share-view`. CSP stricte sur la page publique.

## 11. Tests

- **pgtap RLS** (`supabase/tests/`) : cross-tenant — user B ne peut pas
  select/insert/update/delete les `note_shares` de user A ; unicité partage actif par note.
- **Deno Edge** (`share-view`) : slug valide → contenu ; révoqué → 404 ; note soft-deleted
  → 404 ; slug inconnu → 404 ; format slug invalide → 400/404 ; pas de fuite de champs.
- **Vitest** : `generateSlug` (charset/longueur/unicité statistique), mapping
  create/revoke/list, transform sanitize + flatten wiki-links (cas `<script>`,
  `onerror`, `[[note]]`).
- Rust : aucun changement backend Tauri requis (le partage est TS + Supabase).

## 12. Hors scope (itérations futures)

- Snapshots figés / historique de versions du lien.
- Expiration auto, mot de passe, partage transitif des notes liées.
- Export fichier autonome (HTML/PDF) — autre branche envisagée, écartée au profit du lien.
- Analytics de consultation (nb de vues).
- Plafonds par plan / monétisation du partage.

## 13. Livrables

1. Migration `note_shares` + RLS + index.
2. Edge Function `share-view` + entrée `config.toml` (`verify_jwt = false`).
3. Module `src/lib/sharing/` + hook `useNoteShares`.
4. UI : action « Partager » (éditeur) + panneau « Mes liens partagés » (Settings) + i18n.
5. Page publique `lexena.app/s/<slug>` (repo marketing — à coordonner).
6. Tests : pgtap RLS, Deno edge, Vitest.
7. ADR de clôture + checklist E2E.
