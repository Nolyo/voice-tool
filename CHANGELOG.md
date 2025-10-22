# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

### Added
- 

### Changed
- 

### Fixed
- 

### Removed
- 

---

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

[Unreleased]: https://github.com/Nolyo/voice-tool/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/Nolyo/voice-tool/releases/tag/v2.0.0
