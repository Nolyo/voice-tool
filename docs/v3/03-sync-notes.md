# 03 — Sync notes

> **Statut**: 📝 Stub.
> **Cible**: v3.1 (post-v3.0).
> **Dépendances**: 00, 01, 02.

---

## Périmètre

Sync des **notes texte uniquement** (pas d'audio, pas d'historique transcriptions).

## Questions à trancher

### Schéma DB

- [ ] Table `notes` avec colonnes: id, user_id, title, content, created_at, updated_at, deleted_at (soft delete?)
- [ ] Format du contenu: texte brut, markdown, ou JSON structuré (TipTap/ProseMirror doc)?
- [ ] Tags / favoris / dossiers (cf. backlog 4.4, 4.5, 4.6) — à acter avant ce sous-épique
- [ ] RLS strict + index user_id
- [ ] Tombstones pour soft delete (sync delete sur autres devices)

### Conflict resolution — le sujet dur

Une note ouverte simultanément sur 2 devices = scénario inévitable.

- [ ] Last-write-wins simple (perte silencieuse de données possible)
- [ ] Versioning + merge manuel proposé à l'utilisateur en cas de conflit
- [ ] **CRDT (Yjs / Automerge)** — élimine les conflits par design, mais surcoût lourd (lib + format binaire)
- [ ] Choix transverse impactant le format de stockage côté DB

### Migration des notes locales existantes

- [ ] User actuel a des notes en IndexedDB / Tauri Store
- [ ] Opt-in cloud: upload one-time avec progress bar
- [ ] Backup obligatoire avant upload (export JSON local)
- [ ] Que se passe-t-il pour les notes créées AVANT le compte? On les attribue au compte au signup?

### Volumétrie

- [ ] Limite de taille par note (1 MB? 10 MB?)
- [ ] Limite de nombre de notes par compte? (par plan: free vs paid?)
- [ ] Indexation full-text serveur ou client?

### Recherche

- [ ] Full-text search côté client (déjà en place?) reste local-first
- [ ] Recherche serveur (Postgres FTS) si le corpus est gros?
- [ ] Cohérence avec la posture "le contenu reste accessible offline"

### Sync engine

- [ ] Granularité: par note (delta) ou batch?
- [ ] Realtime via Supabase channels (note ouverte sur 2 devices = sync live)?
- [ ] Throttling pour éviter de spammer Supabase à chaque keystroke

### UX

- [ ] Indicateur de statut sync par note (synced, pending, conflict)
- [ ] "Cette note a été modifiée sur un autre device" → reload? merge dialog?
- [ ] Performance: pagination si user a 1000+ notes

### Suppression

- [ ] Soft delete + purge après X jours (corbeille)
- [ ] Suppression permanente synchronisée (tombstone)
- [ ] Restore depuis corbeille

---

## Livrables attendus

1. Schéma DB notes
2. Module sync notes côté Rust + frontend
3. UX gestion conflits + corbeille
4. Plan de migration des notes locales
5. ADR `0008-notes-conflict-strategy.md`
