# ADR 0018 — Partage public de notes (lien live)

- **Statut** : Accepté
- **Date** : 2026-06-25
- **Sous-épique** : Partage public de notes
- **Supersedes** : —
- **Lien design** : [`docs/superpowers/specs/2026-06-25-note-public-sharing-design.md`](../../superpowers/specs/2026-06-25-note-public-sharing-design.md)
- **Contrat page publique** : [`docs/v3/note-sharing-public-page-contract.md`](../note-sharing-public-page-contract.md)
- **Checklist E2E** : [`docs/v3/04-note-sharing-e2e-checklist.md`](../04-note-sharing-e2e-checklist.md)

---

## Contexte

Un utilisateur souhaite partager des notes riches (texte + images) avec des personnes
qui n'ont pas Lexena installé. Le copier-coller perdait les images (les `data:` URIs
ne se transfèrent pas hors de l'app). La sync cloud des notes est opérationnelle
depuis le sous-épique 03 ; les notes sont stockées côté serveur dans `user_notes`
avec un plafond de 1 MB par note.

Ce document fige les décisions architecturales prises lors du brainstorming du
2026-06-25 et implémentées dans la branche `feat/note-public-sharing`.

---

## Décisions figées

### 1. Lien web live (pas de fichier autonome ni de snapshot figé)

L'URL publique `lexena.app/s/<slug>` reflète **toujours la dernière version
synchronisée** de la note. Il n'y a pas de snapshot à la date de partage.

**Conséquence assumée** : partager une note exige que la sync soit active (la note
doit être dans `user_notes`). Si la sync est désactivée, le bouton « Partager »
affiche un CTA d'activation plutôt que de créer un lien. Le risque qu'un brouillon
soit exposé est reconnu et accepté par l'utilisateur.

### 2. Modèle sans copie de contenu (`note_shares`)

La table `note_shares` stocke uniquement le **pointeur** (`note_id`, `slug`,
`user_id`, `title_snapshot`, dates) — pas de copie de `content_html`. La note
source reste dans `user_notes`. L'Edge Function effectue le join au moment de la
consultation.

**Avantages** :
- Mise à jour automatique (live) sans job de synchronisation.
- Pas de duplication de données ni de désynchronisation possible.
- La révocation est immédiate : il suffit de poser `revoked_at`.

**Inconvénient accepté** : si la note est supprimée (soft-delete), le lien devient
immédiatement 404. C'est le comportement voulu.

### 3. Edge Function anonyme `share-view` avec service role

L'Edge Function `share-view` est déclarée `verify_jwt = false` dans
`supabase/config.toml` (endpoint public sans authentification). Elle utilise la
**service role key** en interne pour contourner le RLS lors du lookup :

```
note_shares (revoked_at IS NULL, slug = ?)
  → user_notes (id = note_id AND user_id = share.user_id AND deleted_at IS NULL)
```

Le triple filtre (`note_id` + `user_id` + `deleted_at IS NULL`) garantit qu'un
slug ne peut jamais retourner une note appartenant à un autre utilisateur ou une
note supprimée.

**Ne sont jamais exposés** : `user_id`, email, liste des autres notes, ou tout autre
champ hors de `{ title, contentHtml, updatedAt }`.

### 4. DOMPurify obligatoire sur la page publique

`contentHtml` est du HTML TipTap brut ; il peut contenir des payloads XSS si la
note a été altérée. La page publique (repo marketing-site) **doit** appliquer
`renderSharedNoteHtml()` de `src/lib/sharing/render-html.ts` avant toute injection
dans le DOM. Cette fonction est la barrière XSS unique ; la sauter n'est pas une
option (cf. [contrat page publique](../note-sharing-public-page-contract.md) §4).

Le hook `afterSanitizeAttributes` est nécessaire pour bloquer `data:image/svg+xml`
et autres variantes que DOMPurify ≤ 3.x ne filtre pas nativement sur `img[src]`.

### 5. Un seul lien actif par note — nouveau slug au re-partage

Un index unique partiel en base garantit l'unicité :

```sql
create unique index note_shares_one_active_per_note
  on public.note_shares (note_id) where revoked_at is null;
```

Tenter de créer un second lien actif pour la même note lève une contrainte Postgres.
Le client doit révoquer l'ancien avant d'en créer un nouveau (ou l'UI peut le faire
automatiquement).

La révocation pose `revoked_at = now()`. Un re-partage insère une **nouvelle ligne**
avec un **nouveau slug**. L'ancienne URL est morte définitivement (le slug révoqué
ne peut jamais être réactivé).

**Motivation** : éviter que des liens partagés publiquement persistent après une
décision explicite de l'utilisateur de les révoquer, même si le slug serait
réutilisé.

### 6. Pas de paywall au MVP

Le partage est disponible sur **tous les plans** tant que la sync est active (posture
free-tier first, cohérente avec la décision de lancement v3.0). Un plafond de liens
actifs par plan est envisageable dans une itération future.

### 7. Wiki-links aplatis en texte sur la page publique

Les nœuds `<a data-note-link>` produits par l'extension TipTap sont remplacés par
leur `textContent` avant sanitization. La note cible n'étant pas partagée, exposer
un lien cliquable (même mort) ou un UUID de note serait trompeur et potentiellement
révélateur de la structure du graphe privé de l'utilisateur.

### 8. Pas d'expiration ni de mot de passe (MVP)

Décision produit : la complexité opérationnelle (jobs d'expiration, UI mot de passe,
token côté visiteur) n'est pas justifiée pour le volume prévu en v3.0. À réévaluer
post-traction si des besoins de confidentialité renforcée remontent.

---

## Sécurité — posture retenue

| Vecteur | Contrôle |
|---|---|
| Énumération de slugs | Slug base62 16 caractères ~95 bits d'entropie ; rate-limit IP sur `share-view` |
| XSS via contenu note | DOMPurify + hook `afterSanitizeAttributes` + CSP stricte (`script-src 'self'`) |
| Fuite de données cross-user | Triple filtre `note_id + user_id + deleted_at IS NULL` en service role ; RLS bloque l'accès owner direct à `note_shares` d'un autre user |
| Slug révoqué réactivé | Impossibilité structurelle : nouveau slug = nouvelle ligne ; l'ancienne `revoked_at` n'est jamais mise à null |
| Data URI non-raster (SVG XSS) | Hook `afterSanitizeAttributes` supprime les `src` `data:` hors liste blanche raster |

---

## Follow-ups (non bloquants pour v3.0)

- **F1** : Plafond de liens actifs par plan (ex. : 5 Free / 50 Starter / illimité Pro).
- **F2** : Expiration automatique optionnelle (TTL configurable sur le lien).
- **F3** : Protection par mot de passe (challenge côté Edge + cookie session).
- **F4** : Analytics de consultation (nombre de vues, dernière consultation).
- **F5** : Partage transitif des notes liées (partage du graphe, non-trivial).
- **F6** : Snapshots figés / historique de versions du lien partagé.
- **F7** : Export fichier autonome (HTML/PDF hors-ligne).
- **F8** : Cache CDN court (≤ 60s) pour les réponses `share-view` — à négocier avec l'infra Cloudflare.

---

## Vérification (état à la livraison)

- ✅ Migration `YYYYMMDDHHMMSS_note_shares.sql` créée avec DDL, RLS, index.
- ✅ Edge Function `share-view` avec `verify_jwt = false`, service role, triple filtre.
- ✅ Tests pgtap RLS : `supabase/tests/rls_note_shares.sql` (isolation cross-tenant).
- ✅ Tests Deno edge : slug valide → 200 ; révoqué → 404 ; note supprimée → 404 ; inconnu → 404 ; format invalide → 400 ; pas de fuite de champs.
- ✅ Module `src/lib/sharing/` : `generateSlug`, `createShare`, `revokeShare`, `listShares`, `getShareUrl`.
- ✅ `src/lib/sharing/render-html.ts` : flatten wiki-links + DOMPurify + hook `afterSanitizeAttributes`.
- ✅ Tests Vitest : sanitization (script, onerror, SVG data URI), flatten, generateSlug (charset/longueur/unicité), mapping, hook.
- ✅ UI : popover éditeur (sync-off gate, create, copy, revoke) + panneau « Mes liens partagés » (Settings → Compte).
- ✅ i18n : toutes les strings via react-i18next.
- ⏳ Déploiement `share-view` + migration distante — action opérateur (cf. checklist E2E §Étapes opérateur).
- ⏳ Checklist E2E 10 cas — à dérouler avant le tag bêta.

---

## Liens

- Design : [`docs/superpowers/specs/2026-06-25-note-public-sharing-design.md`](../../superpowers/specs/2026-06-25-note-public-sharing-design.md)
- Contrat page publique : [`docs/v3/note-sharing-public-page-contract.md`](../note-sharing-public-page-contract.md)
- Checklist E2E : [`docs/v3/04-note-sharing-e2e-checklist.md`](../04-note-sharing-e2e-checklist.md)
- ADR sync notes (contexte) : [`0016-notes-sync-strategy.md`](./0016-notes-sync-strategy.md)
- ADR clôture sync notes : [`0017-sub-epic-03-closure.md`](./0017-sub-epic-03-closure.md)
