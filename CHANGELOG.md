# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.


## [2.7.3] - 2026-04-xx

### Fixed

- Correction d'un bug invalid date lors de la mise à jour
- Ajout d'un bouton de redimmensionnement de la note en demi écran

## [2.7.2] - 2026-04-05

### Added

- Les notes peuvent maintenant contenir des images (copier-coller)
- Le logiciel ne s'ouvre plus en plusieurs instance si déjà en cours d'exécution

## [2.7.0] - 2026-04-03

### Added

- Fonctionnalité de notes : éditeur de notes intégré avec onglet dédié dans le tableau de bord
- Option pour masquer le panneau d'enregistrement dans les paramètres
- Navigation dans les paramètres améliorée avec une barre latérale et des sections organisées

## [2.6.1] - 2026-04-03

### Added

- Préchargement du modèle Whisper en arrière-plan pour le fournisseur de transcription local (démarrage plus rapide)
- Enregistrement et désenregistrement dynamique du raccourci d'annulation

## [2.6.0] - 2026-04-03

### Added

- Gestion du vocabulaire : support des snippets et d'un dictionnaire personnalisé
- Mode local : transcription via Whisper local, gratuit et sans limite

## [2.5.4] - 2026-03-17

### Added

- Ajout du mode local, transcription via Whisper local gratuit et sans limite

## [2.3.1] - 2025-11-22

### Fixed

- Fix de mise à jour automatique

## [2.2.0] - 2025-11-02

### Added

- Mode compact vs étendu pour la mini fenêtre lors du streaming Deepgram
- Basculement automatique de la mini fenêtre (42px → 150px) au démarrage/arrêt de Deepgram
- Affichage de la transcription en temps réel dans la mini fenêtre en mode étendu
- Commande backend `set_mini_window_mode` pour redimensionner la mini fenêtre dynamiquement
- Support des événements `transcription-interim` et `transcription-final` dans la mini fenêtre

## [2.1.0] - 2025-10-25

- Automatisation des mise à jour

## [2.0.2] - 2025-10-24

- Correction de la CI

## [2.0.1] - 2025-10-24

### Fixed

- Correction d'un bug dans la CI/CD empêchant la génération correcte du fichier `releases.json`

## [2.0.0] - 2025-10-22

### Added

- Application Tauri avec enregistrement audio en temps réel
- Visualisation des niveaux audio (fenêtre principale + mini fenêtre flottante)
- Intégration OpenAI Whisper pour la transcription
- Raccourcis clavier globaux configurables (toggle, push-to-talk, afficher fenêtre)
- Architecture multi-fenêtres (dashboard + mini visualiseur)
- Intégration à la barre système avec menu contextuel
- Persistance des paramètres via Tauri Store
- Historique des transcriptions avec IndexedDB
- Auto-collage des transcriptions dans la fenêtre active
- Sélection du périphérique audio d'entrée
- Gestion automatique de la migration du répertoire d'enregistrements
- Effets sonores (début/fin d'enregistrement, succès)
- Logs structurés depuis Rust vers le frontend
- Support de plusieurs formats d'installateurs (portable, NSIS, MSI)
- CI/CD GitHub Actions pour les releases automatiques
- Génération automatique du fichier `releases.json` pour le site web

### Technical

- Stack: React 19, TypeScript, Tailwind CSS v4
- Backend: Rust avec cpal pour l'audio
- Build: Tauri v2, Vite, pnpm
- Windows uniquement (extensible multi-plateforme)

---

## Instructions d'utilisation de ce CHANGELOG

### Quand ajouter une entrée

Ajoutez une entrée **à chaque modification significative** sous la section `[Unreleased]`.

### Catégories

- **Added** : Nouvelles fonctionnalités
- **Changed** : Modifications de fonctionnalités existantes
- **Deprecated** : Fonctionnalités obsolètes (seront supprimées prochainement)
- **Removed** : Fonctionnalités supprimées
- **Fixed** : Corrections de bugs
- **Security** : Corrections de vulnérabilités

### Workflow de release

1. **Pendant le développement** : Ajoutez vos changements sous `[Unreleased]`

2. **Avant une release** :

   ```markdown
   ## [Unreleased]

   ## [2.1.0] - 2025-11-15

   ### Added

   - Nouveau thème sombre
   - Support de macOS

   ### Fixed

   - Correction du bug de crash au démarrage
   ```

3. **Mettez à jour les liens en bas du fichier** :
   ```markdown
   [Unreleased]: https://github.com/Nolyo/voice-tool/compare/v2.1.0...HEAD
   [2.1.0]: https://github.com/Nolyo/voice-tool/compare/v2.0.0...v2.1.0
   [2.0.0]: https://github.com/Nolyo/voice-tool/releases/tag/v2.0.0
   ```

### Exemples

```markdown
### Added

- Nouveau raccourci Ctrl+Shift+R pour redémarrer l'enregistrement
- Support des langues espagnol et allemand pour la transcription
- Paramètre pour ajuster la sensibilité du micro

### Changed

- La mini fenêtre est maintenant redimensionnable
- Amélioration des performances de la visualisation audio (réduction de 30% CPU)

### Fixed

- Correction du crash lors de la déconnexion du micro USB
- Résolution du problème d'échappement des caractères spéciaux dans les transcriptions
- La fenêtre principale ne se cache plus au démarrage si `--minimized` n'est pas passé

### Removed

- Suppression du support de Windows 7 (EOL)
```

---

## Liens des versions

[2.7.3]: https://github.com/Nolyo/voice-tool/compare/v2.7.2...HEAD
[2.7.2]: https://github.com/Nolyo/voice-tool/compare/v2.6.0...v2.7.2
[2.7.0]: https://github.com/Nolyo/voice-tool/compare/v2.6.0...v2.7.0
[2.6.0]: https://github.com/Nolyo/voice-tool/compare/v2.5.4...v2.6.0
[2.5.4]: https://github.com/Nolyo/voice-tool/compare/v2.5.3...v2.5.4
[2.5.3]: https://github.com/Nolyo/voice-tool/compare/v2.5.2...v2.5.3
[2.5.2]: https://github.com/Nolyo/voice-tool/compare/v2.5.1...v2.5.2
[2.5.1]: https://github.com/Nolyo/voice-tool/compare/v2.5.0...v2.5.1
[2.5.0]: https://github.com/Nolyo/voice-tool/compare/v2.0.0...v2.5.0
[2.0.0]: https://github.com/Nolyo/voice-tool/releases/tag/v2.0.0
