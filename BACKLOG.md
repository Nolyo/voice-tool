# Backlog Voice Tool

> Organisation des idées issues de `IDEAS.md` en épiques et stories.
> `IDEAS.md` reste le brain-dump d'origine, `BACKLOG.md` est la vue actionnable.

---

>Notes pour le LLM en charge du développement:
>Pour chaque développement, il est nécessaire de créer une branche dédiée à la feature (ex: `feat/notes-refactor`) à partir de `develop`. Lorsque l'utilisateur aura testé le logiciel et aura donné son Go pour terminer la feature, tu pourras faire un commit en suivant les règles de nommage standard. Tu peux regarder les titres des derniers commits. Puis crée une PR vers Develop Tu ne dois pas la merge, c'est l'utilisateur qui doit le faire.

## Vue d'ensemble & priorisation

| Ordre suggéré | Épique | Version cible | Complexité | Bloquant pour |
|---|---|---|---|---|
| 1 | EPIC-01 — Polish UX des Notes | 2.9.x | Faible | — |
| 2 | EPIC-06 — Automatisation des releases | n'importe quand | Moyenne | — |
| 3 | EPIC-03 — Traduction (mode dictée) | 2.9.0 | Moyenne | — |
| 4 | EPIC-02 — Refonte des Notes (Notion-like) | 2.10.0 | Élevée | — |
| 5 | EPIC-04 — Traduction (mode écoute système) | 2.11.0 | Élevée | impacté par EPIC-05 |
| 6 | EPIC-05 — Compatibilité Mac & Linux | à positionner | Élevée | — |
| 7 | EPIC-07 — Audit de sécurité | avant 3.0.0 | Très élevée | **EPIC-08 (bloquant)** |
| 8 | EPIC-08 — Comptes & service payant | 3.0.0 | Très élevée | — |

### Règles d'enchaînement importantes

1. **EPIC-03 et EPIC-04 ne doivent PAS être développés en parallèle** malgré le sujet commun. Flux audio, UX et complexité radicalement différents.
2. **EPIC-07 est un prérequis dur de EPIC-08** — aucun lancement v3 sans remédiation des failles critiques.
3. **EPIC-05 impacte EPIC-04** — si la capture loopback utilise des APIs Windows-only, prévoir une refonte pour Mac/Linux.
4. **EPIC-01 avant EPIC-02** paraît contre-intuitif (pourquoi polir ce qu'on va refaire ?) mais EPIC-02 est loin dans la roadmap → les quick wins valent quand même le coup tout de suite.

---

## EPIC-01 — Polish UX des Notes ✅ (Terminé)

**Objectif** : corriger les frictions rapides sur le système de notes actuel, sans toucher à l'architecture.
**Version cible** : 2.9.x (quick wins)
**Complexité** : faible
**Indépendant de** : EPIC-02 (ce sont des fixes sur l'existant, pas la refonte)

### Stories

- **NOTE-1 — Ne pas créer de note vide à la fermeture**
  - Contexte : Ouvrir un nouvel onglet dans la modale puis le fermer aussitôt crée une note vide en liste.
  - Deux options à trancher :
    - A. Ne créer la note qu'après N caractères saisis
    - B. Ne pas sauvegarder la note à la fermeture si le contenu est vide
  - Recommandation PO : **option B**, plus simple et moins d'états transitoires.
  - Critère d'acceptation : ouvrir onglet depuis la modale → fermer sans saisie → aucune note ajoutée à la liste.

- **NOTE-2 — Suppression depuis la modale**
  - Bouton "Supprimer" (icon poubelle rouge ?) dans la modale d'édition.
  - Action : ferme l'onglet de la modale + retire la note de la liste (confirmation à définir).
  - Critère d'acceptation : la note disparaît immédiatement de la liste en background.

- **NOTE-3 — Feedback visuel sur "copier"**
  - Ajouter un retour (toast, changement d'icône, animation) au clic sur le bouton copier d'une note.
  - Critère d'acceptation : l'utilisateur sait sans ambiguïté que le contenu est dans le presse-papiers.

---

## EPIC-02 — Refonte des Notes (Notion-like)

**Objectif** : transformer l'éditeur de notes en un éditeur riche avec listes, sous-listes, hiérarchie.
**Version cible** : 2.10.0
**Complexité** : élevée

### Décisions à prendre avant de coder

- Choix du framework d'éditeur riche : TipTap / Lexical / BlockNote / ProseMirror direct ?
- Format de persistance : JSON structuré vs Markdown ?
- Stratégie de migration des notes existantes vers le nouveau format.
- Périmètre fonctionnel v1 : listes à puces / sous-listes / titres / checkboxes / autres ?

### Stories

- **NOTE-R1** — Spike : choix de l'éditeur riche (POC sur 2 candidats, décision documentée)
- **NOTE-R2** — Intégration de l'éditeur dans la modale existante
- **NOTE-R3** — Persistance : définir et implémenter le format de stockage
- **NOTE-R4** — Migration des notes existantes vers le nouveau format (avec fallback sûr)
- **NOTE-R5** — Listes à puces et sous-listes
- **NOTE-R6** — Titres et mise en forme basique (gras, italique, etc.)
- **NOTE-R7** — Raccourcis clavier type Notion (`Tab` pour indenter, etc.)

---

## EPIC-03 — Mode Traduction (dictée micro)

**Objectif** : permettre de dicter dans une langue et obtenir directement la traduction dans une autre.
**Version cible** : 2.9.0
**Complexité** : moyenne
**TOTALEMENT INDÉPENDANT de EPIC-04** — ne pas mélanger, flux audio et UX différents.

### Stories

- **TRA-D1** — Toggle "mode traduction" dans la mini-window (activable pendant CTRL+F11)
- **TRA-D2** — Page paramètres : création / édition / choix de préréglages de traduction (ex : FR→EN, EN→ES)
- **TRA-D3** — Support de **plusieurs** préréglages (aujourd'hui limité à un seul)
- **TRA-D4** — Brancher le préréglage actif sur le pipeline de transcription (Whisper / Deepgram / local)
- **TRA-D5** — Indicateur visuel dans la mini-window signalant que le mode traduction est actif

---

## EPIC-04 — Mode Traduction (écoute système / mixage stéréo)

**Objectif** : capturer le son système (réunions visio, vidéos) et afficher en temps réel la traduction en français.
**Version cible** : 2.11.0 (ou après 2.10)
**Complexité** : élevée
**TOTALEMENT INDÉPENDANT de EPIC-03** — ne pas développer en parallèle.

### Risques techniques à lever tôt

- Faisabilité de la capture loopback sur Windows via cpal / WASAPI.
- Alternative dégradée : imposer un device virtuel type VB-Cable (UX médiocre).
- Cross-platform : impact majeur si EPIC-05 est en jeu.

### Stories

- **TRA-E1** — Spike : capture loopback système sur Windows avec cpal (go/no-go)
- **TRA-E2** — Sélection d'un device "loopback" dans la liste des devices audio
- **TRA-E3** — Pipeline streaming (Deepgram) pour transcription + traduction en continu
- **TRA-E4** — Fenêtre dédiée affichant le texte traduit en temps réel
- **TRA-E5** — Suggestions de réponses toutes faites ("oui", "bien sûr", etc.) en langue cible
- **TRA-E6** *(stretch)* — Copie rapide d'une suggestion vers le presse-papiers

---

## EPIC-05 — Compatibilité Mac & Linux

**Objectif** : rendre l'application utilisable sur macOS et sur les distributions Linux majeures.
**Version cible** : à positionner — potentiellement étalé sur plusieurs versions.
**Complexité** : élevée (nombreuses inconnues).

### Stories

- **OS-1** — Audit du code platform-specific (WASAPI, raccourcis globaux, enigo, autostart, tray, clipboard, updater MSI/NSIS vs DMG/AppImage/deb)
- **OS-2** — POC build macOS (runner mac + `pnpm tauri build`)
- **OS-3** — POC build Linux (Ubuntu LTS)
- **OS-4** — Matrice multi-OS dans le workflow CI `release.yml`
- **OS-5** — Updater cross-plateforme (signature + installeurs spécifiques)
- **OS-6** — Raccourcis par défaut adaptés (ex : `Cmd` sur Mac au lieu de `Ctrl`)
- **OS-7** — Documentation d'installation par OS

---

## EPIC-06 — Automatisation complète des releases

**Objectif** : un seul script qui pilote tout le cycle de release (bump → tag → push → changelog → releases.json).
**Version cible** : à tout moment (outillage dev, gain transverse).
**Complexité** : moyenne.

### Stories

- **CI-1** — Script `release.mjs` prenant en argument la version + flag beta (`--beta`)
- **CI-2** — Bump automatique dans `package.json`, `Cargo.toml`, `tauri.conf.json`
- **CI-3** — Génération du changelog depuis les commits conventionnels
- **CI-4** — Création du tag git + push
- **CI-5** — Mise à jour automatique de `releases.json` post-build CI
- **CI-6** — Checks pré-release (lint, `cargo check`, build frontend)
- **CI-7** — Mode `--dry-run` pour valider sans rien pousser

---

## EPIC-07 — Audit de sécurité (prérequis v3)

**Objectif** : identifier et corriger les failles du code existant avant d'ouvrir l'app aux comptes utilisateurs et au paiement.
**Version cible** : avant 3.0.0 — **bloquant**.
**Complexité** : très élevée (code "vibe codé", large surface d'attaque attendue).

### Stories

- **SEC-1** — Audit manuel des commandes Tauri (authorization, validation des inputs)
- **SEC-2** — Audit des `capabilities` Tauri — principe de moindre privilège
- **SEC-3** — Audit du stockage des clés API (chiffrement at-rest ?)
- **SEC-4** — Audit de la chaîne complète de l'updater (signature, serveur, fallback)
- **SEC-5** — `cargo audit` + `pnpm audit` sur toutes les dépendances
- **SEC-6** — Audit des flux IPC (injection, validation, sérialisation)
- **SEC-7** — Threat model du futur service user (login, tokens, session, paiement)
- **SEC-8** — Plan de remédiation priorisé (critique / majeur / mineur)

---

## EPIC-08 — Comptes utilisateurs & service payant (v3)

**Objectif** : introduire des comptes utilisateurs et une offre payante, en gardant la transcription gratuite et l'usage offline possible.
**Version cible** : 3.0.0
**Complexité** : très élevée.
**Dépendances** : EPIC-07 doit être terminé (au moins sur les findings critiques/majeurs).

### Contraintes produit déjà actées

- La transcription reste **gratuite**.
- L'export des paramètres reste possible.
- L'app reste utilisable totalement gratuitement.

### Stories (à raffiner après EPIC-07)

- **USER-1** — Définition de l'offre payante : quelles features sont premium ?
- **USER-2** — Choix du back-end auth (self-hosted / Supabase / Clerk / Auth0…)
- **USER-3** — Flow login / signup intégré à l'app
- **USER-4** — Intégration paiement (Stripe ?) + gestion abonnement
- **USER-5** — Sync cloud optionnelle (settings, notes, historique)
- **USER-6** — Gating technique des features premium
- **USER-7** — Onboarding & pages marketing premium

---

## Notes de méthode

- Chaque story doit être découpable en **une PR** ou très peu. Si une story semble demander plusieurs PRs, elle doit être redécoupée avant d'être démarrée.
- Les spikes (`TRA-E1`, `NOTE-R1`) sont des **boîtes de temps** à résultat = décision documentée, pas à résultat = code merge.
- Avant de démarrer un épique, relire la section "Décisions à prendre" / "Risques techniques" et faire les choix explicitement.
