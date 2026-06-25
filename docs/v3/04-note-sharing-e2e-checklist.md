# Partage public de notes : checklist E2E manuelle

> **À dérouler avant le tag bêta de livraison de la fonctionnalité de partage.** Bloquant.
> Calqué sur [`03-sync-notes-e2e-checklist.md`](./03-sync-notes-e2e-checklist.md).

## Prérequis

- Build prod (`pnpm tauri build`) installé et lancé.
- Compte connecté, **sync activée** (sous-épique 02 + 03 déployées).
- Edge Function `share-view` déployée (voir §Étapes opérateur ci-dessous).
- Migration `note_shares` appliquée (`pnpm exec supabase migration list` doit lister la migration).
- Un navigateur en mode navigation privée disponible (pour simuler un visiteur non connecté).

---

## Scénarios

### 1. Sync désactivée — bouton de partage bloqué

- [ ] Se connecter mais **ne pas activer la sync** (ou la désactiver si déjà active).
- [ ] Ouvrir une note dans l'éditeur.
- [ ] Cliquer sur le bouton « Partager » dans l'en-tête de l'éditeur.
- [ ] **Attendu** : le popover affiche le message « Active la synchronisation pour partager » (ou équivalent i18n) avec un CTA vers les réglages de sync. Aucun lien n'est créé. Aucune entrée dans `note_shares` (vérifiable dans Supabase Studio).

### 2. Création d'un lien — rendu avec images

- [ ] Sync activée. Créer une note avec un titre, du texte formaté, et au moins une image collée (data URI base64).
- [ ] Attendre la sync (icône ✅ dans le header).
- [ ] Ouvrir l'éditeur de cette note → cliquer « Partager » → « Créer un lien ».
- [ ] **Attendu** : un slug s'affiche dans le popover avec un bouton « Copier ».
- [ ] Copier l'URL et l'ouvrir dans une fenêtre de navigation privée.
- [ ] **Attendu** : la page `lexena.app/s/<slug>` (ou équivalent local) affiche le titre, le texte formaté, et l'image base64 correctement rendue. Le CTA « Créé avec Lexena » est visible.

### 3. Lien live — modification reflétée

- [ ] Laisser la page publique ouverte dans le navigateur privé (ou noter l'URL).
- [ ] Dans l'éditeur Lexena, modifier le contenu de la note (ajouter une phrase).
- [ ] Attendre la sync.
- [ ] Recharger la page publique.
- [ ] **Attendu** : la modification est visible. Le titre et le contenu correspondent à la version la plus récente synchronisée.

### 4. Wiki-links aplatis en texte brut

- [ ] Créer ou modifier une note contenant une référence à une autre note via le mécanisme wiki-link de l'éditeur (`[[Titre de note]]`, produit un `<a data-note-link>` dans le HTML).
- [ ] Partager la note (ou recharger le lien existant après sync).
- [ ] **Attendu** : la page publique affiche le label du wiki-link en texte brut non cliquable. Aucun élément `<a data-note-link>` dans le DOM (inspecteur navigateur). Aucun UUID de note ne fuite dans la page.

### 5. Révocation depuis le popover de l'éditeur → 404

- [ ] Dans l'éditeur, ouvrir le popover « Partager » sur une note partagée.
- [ ] Cliquer « Arrêter le partage » (ou équivalent i18n).
- [ ] **Attendu** : le popover repasse à l'état « Créer un lien ».
- [ ] Ouvrir l'ancienne URL dans le navigateur privé (ou recharger).
- [ ] **Attendu** : la page renvoie 404 — message « Ce lien n'existe plus ou a été désactivé ».
- [ ] Vérifier dans Supabase Studio : `select revoked_at from note_shares where slug = '<ancien-slug>'` → `revoked_at` non null.

### 6. Révocation depuis le panneau « Mes liens partagés » → 404 + disparition

- [ ] Partager au moins une note.
- [ ] Aller dans Settings → Compte → section « Mes liens partagés ».
- [ ] **Attendu** : le lien apparaît dans la liste avec son titre (`title_snapshot`), l'URL et la date.
- [ ] Cliquer « Révoquer » sur ce lien.
- [ ] **Attendu** : le lien disparaît de la liste immédiatement.
- [ ] Ouvrir l'ancienne URL dans le navigateur privé.
- [ ] **Attendu** : 404 — « Ce lien n'existe plus ou a été désactivé ».

### 7. Re-partage après révocation → nouveau slug, ancienne URL reste 404

- [ ] Révoquer le lien d'une note (cas 5 ou 6).
- [ ] Dans l'éditeur, ouvrir à nouveau le popover « Partager » sur la même note.
- [ ] Cliquer « Créer un lien ».
- [ ] **Attendu** : un **nouveau slug** est généré (différent de l'ancien).
- [ ] Ouvrir le nouveau lien → la note s'affiche correctement.
- [ ] Ouvrir l'**ancien** lien → 404.
- [ ] Vérifier dans Supabase Studio : 2 lignes dans `note_shares` pour le même `note_id` — l'ancienne avec `revoked_at` non null, la nouvelle avec `revoked_at` null.

### 8. Injection script / onerror — non exécutée

- [ ] Créer une note contenant les charges suivantes dans le corps (saisir directement dans l'éditeur) :
  - `<script>alert('xss')</script>`
  - `<img src="x" onerror="alert('onerror')">`
- [ ] Partager la note et ouvrir le lien dans le navigateur privé.
- [ ] **Attendu** : aucune alerte JavaScript. Inspecter le DOM : les balises `<script>` sont absentes ; l'attribut `onerror` est absent sur `<img>`. La page s'affiche sans erreur console liée à un script de la note.

### 9. Note soft-deletée → lien renvoie 404

- [ ] Partager une note et noter son URL.
- [ ] Supprimer la note dans Lexena (icône corbeille — soft-delete).
- [ ] Attendre la sync.
- [ ] Ouvrir le lien dans le navigateur privé.
- [ ] **Attendu** : 404 — « Ce lien n'existe plus ou a été désactivé ». Vérifier dans Supabase Studio : `select deleted_at from user_notes where id = '<note-id>'` → non null.

### 10. Isolation cross-account

- [ ] Compte A : partager une note, noter le `share_id` (UUID) depuis Supabase Studio.
- [ ] Compte B (autre utilisateur, autre session Lexena) :
  - [ ] Dans Supabase Studio, tenter `select * from note_shares where user_id = '<uid_A>'` via la connexion B (ou via la Publishable Key de B dans un client supabase-js) → **0 résultat** (RLS deny-by-default).
  - [ ] Tenter `update note_shares set revoked_at = now() where id = '<share_id_A>'` → **0 lignes modifiées** (RLS interdit la modification cross-tenant).
- [ ] **Attendu** : le compte B ne peut ni lister ni révoquer les liens du compte A.

---

## Étapes opérateur (Docker requis)

> Ces étapes nécessitent Docker (pour Supabase CLI local) et les droits de déploiement.
> Elles ne font pas partie du test manuel — elles sont les prérequis infra à exécuter
> avant de dérouler les scénarios ci-dessus.

```bash
# 1. Vérifier les tests pgtap RLS (isolation cross-tenant note_shares)
pnpm exec supabase test db --file supabase/tests/rls_note_shares.sql

# 2. Appliquer les migrations (table note_shares + index)
pnpm exec supabase db push

# 3. Déployer l'Edge Function share-view sans vérification JWT (endpoint anonyme)
pnpm exec supabase functions deploy share-view --no-verify-jwt
```

Résultats attendus :

- `supabase test db` : tous les cas pgtap passent (✅ cross-tenant select/insert/update/delete + unicité index actif par note).
- `supabase db push` : migration `YYYYMMDDHHMMSS_note_shares.sql` marquée comme appliquée.
- `functions deploy` : la fonction est accessible sans Authorization header (vérifier avec `curl -H "apikey: <publishable_key>" "https://<ref>.supabase.co/functions/v1/share-view?s=test"` → 400 `invalid_slug`, pas 401).

---

## Critère de release

10/10 ✅. Tout cas bloquant non passé empêche le tag bêta de livraison.

---

## Liens

- [Design / spec](../superpowers/specs/2026-06-25-note-public-sharing-design.md)
- [ADR 0018](./decisions/0018-note-public-sharing.md)
- [Contrat page publique](./note-sharing-public-page-contract.md)
