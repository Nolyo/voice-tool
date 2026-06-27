# Réorganisation des paramètres — Design

Date : 2026-06-28
Statut : proposé

## Problème

L'écran des paramètres expose **11 sections** dans la sidebar. C'est trop, et le
découpage est trop granulaire : des réglages qui relèvent du même geste utilisateur
sont éparpillés (transcription / post-traitement / vocabulaire séparés ; mode
d'insertion enterré dans « Système » ; « Cloud » isolé du « Compte » alors qu'ils
parlent du même abonnement). Un nouvel utilisateur ne sait pas où chercher.

## Objectif

Passer de **11 → 7 pages**, en regroupant par modèle mental utilisateur, inspiré des
réglages de logiciels établis (chaque grand domaine = une page, sous-réglages empilés
en cartes). Aucune fonctionnalité supprimée — uniquement déplacée/regroupée.

Décisions validées (brainstorming) :
- Niveau de regroupement : **modéré, ~7 pages**.
- Navigation interne des pages fusionnées : **cartes empilées + scroll** (pas de
  sous-onglets ni sous-nav d'ancres).

## Cible : 7 sections

| # | Page (id) | Icône | Contenu | Provenance |
|---|-----------|-------|---------|-----------|
| 1 | **Dictée** (`section-dictee`) | Sparkles | Transcription + Post-traitement + Vocabulaire (3 cartes empilées) | fusion `transcription` + `post-process` + `vocabulaire` |
| 2 | **Audio** (`section-audio`) | Mic | Micro, test, seuil de silence, sons, aperçu audio | inchangé |
| 3 | **Apparence** (`section-apparence`) | Palette | Thème, langue UI, mini-fenêtre | inchangé |
| 4 | **Raccourcis** (`section-raccourcis`) | Keyboard | Hotkeys + **mode d'insertion** (cursor/clipboard/none) | `raccourcis` + carte « mode insertion » extraite de `système` |
| 5 | **Compte & Cloud** (`section-compte`) | UserCircle2 | Auth, sync, backups, appareils, partages + **quota/abonnement** | fusion `compte` + `cloud` |
| 6 | **Système** (`section-systeme`) | Settings | Démarrage Windows, mode dev, rétention (enregistrements + historique), zone de danger | `système` **moins** la carte mode d'insertion |
| 7 | **À propos** (`section-a-propos`) | Info | Identité/version + GitHub + **mises à jour** (statut, canal, auto-check) | fusion `à propos` + `mises à jour` |

Ordre de la sidebar = celui du tableau (Dictée d'abord, À propos en dernier).

## Architecture

Le mécanisme actuel est conservé intégralement :
- `Dashboard` détient l'état `activeSettingsSection: SettingsSectionId`.
- `DashboardSidebar` → `SettingsSidebarSection` rend la liste depuis `NAV_ITEM_DEFS`.
- `SettingTabs` rend la section active.
- Chaque section reste un composant autonome retournant des cartes
  `vt-card-sectioned` avec leur propre `SectionHeader`. **L'empilement de plusieurs
  sections existantes dans une page fusionnée est donc trivial** : un composant parent
  les rend l'une sous l'autre dans un conteneur `space-y-5`.

### Composants

**Pages fusionnées (nouveaux wrappers minces)** — chacune empile les sections
existantes sans réécrire leur contenu :

- `DictationSection` : rend `<TranscriptionSection/>`, `<PostProcessSection/>`,
  `<VocabularySection/>`. Les sous-composants existants sont conservés tels quels ;
  on ne fait que les composer.
- `AboutSection` étendu : rend son contenu actuel + `<UpdaterSection/>` empilé en
  dessous. (Ou un wrapper `AboutAndUpdatesSection` ; choix d'implémentation laissé au
  plan, l'important est l'empilement.)
- `AccountSection` étendu : rend son contenu actuel + la carte quota/abonnement de
  `CloudSection` empilée. `CloudSection` exposait déjà tout son contenu dans une
  carte ; on la réutilise comme sous-composant (visible uniquement signed-in, comme
  aujourd'hui).

**Carte « mode d'insertion » extraite** :
- Le bloc « mode d'insertion » (radio cards cursor/clipboard/none) est extrait de
  `SystemSection` vers un sous-composant réutilisable (ex. `InsertionModeCard`) rendu
  désormais dans `ShortcutsSection`. `SystemSection` ne l'affiche plus.

**Type & nav** (`common/SettingsNav.tsx`) :
- `SettingsSectionId` réduit à 7 valeurs : `section-dictee`, `section-audio`,
  `section-apparence`, `section-raccourcis`, `section-compte`, `section-systeme`,
  `section-a-propos`.
- `NAV_ITEM_DEFS` réduit à 7 entrées (ordre ci-dessus), icônes du tableau.
- `AUTH_ONLY_IDS` vidé : il n'y a plus de section auth-only (`section-cloud`
  disparaît ; son contenu vit sous `section-compte` qui gère déjà l'état signed-out).
- Icônes `Wand2`, `BookOpen`, `Cloud`, `RefreshCw` retirées des imports de la nav
  (elles restent utilisées dans les sections elles-mêmes via `VtIcon`).

**Orchestrateur** (`SettingTabs.tsx`) : 7 branches au lieu de 11.

### Compatibilité des deep-links (anciens ids)

Des appelants externes ciblent encore d'anciens ids. On ajoute un résolveur
`resolveSettingsTarget(id)` dans `common/SettingsNav.tsx` qui mappe tout id (legacy
ou nouveau) vers `{ section: SettingsSectionId; anchor?: string }` :

| Id entrant (legacy) | → section | → anchor (scroll vers carte) |
|---|---|---|
| `section-transcription` | `section-dictee` | `dictee-transcription` |
| `section-post-process` | `section-dictee` | `dictee-post-process` |
| `section-vocabulaire` | `section-dictee` | `dictee-vocabulaire` |
| `section-cloud` | `section-compte` | `compte-cloud` |
| `section-mises-a-jour` | `section-a-propos` | `apropos-updates` |

Câblage des appelants :
- `Dashboard.tsx` défaut `section-transcription` → `section-dictee`. Reset (`:304`)
  idem. Le handler de l'event `lexena:open-settings` (`:239`) passe par
  `resolveSettingsTarget` puis sélectionne la section (+ scroll vers l'anchor si
  présent). Bouton notif MAJ (`:395`) → `section-a-propos` (+ anchor `apropos-updates`).
- `ExpirationPopup.tsx:76` émet toujours `section-cloud` ; le résolveur le route vers
  `section-compte` + scroll cloud. (On peut aussi mettre à jour l'émetteur — non
  bloquant grâce au résolveur.)
- `TranscriptionSection` « gérer le plan » : `onSectionChange("section-compte")` (au
  lieu de `section-cloud`).
- `AboutSection` « vérifier les mises à jour » : devient un scroll vers la carte
  updater de la même page (anchor `apropos-updates`) au lieu d'une nav inter-section.

Le scroll vers une carte utilise un `id` HTML sur le conteneur de chaque carte
concernée + `scrollIntoView({ behavior: "smooth" })` (déclenché après le changement
de section). Mécanisme léger, cohérent avec l'`scrollTo` déjà présent dans
`SettingsNav`.

## i18n

- Nouvelles clés nav : `settings.nav.dictation` + `settings.nav.dictationSubtitle`
  (FR « Dictée » / « Transcription, IA et vocabulaire » ; EN équivalents).
- `settings.nav.about` / `aboutSubtitle` : sous-titre élargi pour inclure les MAJ
  (ex. FR « Version, mises à jour et liens »).
- `auth.account.sectionTitle` : devient « Compte & Cloud » (FR/EN). Sous-titre adapté.
- Clés des entrées supprimées (`postProcess`, `vocabulary`, `audio`*, `shortcuts`*,
  `updates`, `cloud` côté **nav**) : retirées de `NAV_ITEM_DEFS` mais les clés de
  **contenu** des sections (`settings.postProcess.*`, `settings.vocabulary.*`, etc.)
  sont **conservées** (le contenu est juste déplacé, pas supprimé).
- Toute nouvelle string passe par react-i18next (FR + EN), conformément aux règles
  projet — aucun texte en dur.

## Hors périmètre (YAGNI)

- Pas de sous-onglets ni de sous-nav d'ancres sticky (rejeté au brainstorming).
- Pas de refonte visuelle des cartes existantes ni de leur logique métier.
- Pas de découpage de `AccountSection` (1217 lignes) : hors sujet ici, on se contente
  d'y composer la carte cloud. Un refactor de ce fichier pourra faire l'objet d'un
  travail dédié.
- Pas de changement backend Rust, ni de stockage des settings.

## Tests / vérification

- `pnpm build` (tsc + vite) doit passer : la réduction de `SettingsSectionId` fait
  remonter à la compilation tout id orphelin → garde-fou naturel.
- `CloudSection.test.tsx` existant doit continuer à passer (le composant cloud est
  réutilisé, pas réécrit) ; ajuster si le wrapping change son montage.
- Vérification manuelle : naviguer les 7 pages, vérifier que les deep-links
  (popup expiration → cloud, bouton notif MAJ, « gérer le plan », « vérifier MAJ »)
  atterrissent sur la bonne page/carte.

## Risques

- **Deep-links cassés** si un émetteur est oublié → mitigé par le résolveur central
  qui accepte les ids legacy.
- **Perte de repère utilisateur** (sections déplacées) → acceptable, c'est l'objectif ;
  parc utilisateur nul avant launch v3.0, donc pas d'enjeu de migration.
