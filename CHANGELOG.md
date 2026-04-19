## [2.10.1] - 2026-04-22

### ✨ Added
- New System of dark / light themes with automatic switching based on system preferences.
- In parameters, you can now delete your data (recordings, transcriptions, notes) without uninstalling the app.

### 🐛 Fixed
- Enhance Markdown handling in AI assistant with Turndown and Marked integration (preserve line breaks, support tables, code blocks, lists)

## [2.10.0] - 2026-04-18

### ✨ Added
- Universal GPU acceleration via Vulkan backend - local transcription now uses GPU automatically on NVIDIA, AMD, and Intel hardware without requiring any additional installation
- Automatic CPU fallback when no compatible GPU is detected, ensuring the app runs on any Windows machine
- Notes tab in sidebar navigation - quick access to notes alongside History, Settings, and Logs
- Settings sub-navigation in sidebar - select individual settings sections without scrolling through all sections
- Onboarding wizard for model setup - guides users through initial configuration and model selection on first launch
- New model supported: Grock (x.com/grock-ai) - an open-source, high-performance speech recognition model with competitive accuracy and speed, providing an alternative to Whisper for api transcription
- Translation mode now works with the local Whisper engine (previously only reliable with the OpenAI API)
- Configurable hotkey to toggle translation mode while recording — active only during an active recording so it does not interfere with your other keyboard shortcuts (Settings → Shortcuts → "Toggle translation mode")
- Redesigned translate button in the mini window with a clearer icon and label (TRAD/EN) instead of the ambiguous "x"

### 🔧 Changed
- Switched local transcription engine from CUDA to Vulkan - no NVIDIA CUDA runtime required anymore
- Streamlined installer: only the recommended NSIS setup (voice-tool_x.x.x_x64-setup.exe) is now distributed, removing the MSI and portable variants that caused confusion with auto-updates
- Redesigned the history panel: recording card is now a compact horizontal banner (full width), transcription details open in a sliding sidebar on the right instead of a fixed side panel
- Keyboard shortcuts (toggle / push-to-talk) are now displayed directly on the recording card when idle
- Copy and Listen buttons in the detail sidebar are now side by side

### 🐛 Fixed
- Translation mode state is now kept in sync between the main window and the mini window in real time — toggling on either side updates the other immediately, no app restart required
- Removed stray leading punctuation sometimes emitted at the start of English transcriptions

### ℹ️ Note
- The first transcription after installation may take longer than usual while GPU shaders are compiled and cached - subsequent transcriptions are fast as normal

## [2.9.0] - 2026-04-12

### ✨ Added
- Rich-text editor for notes with context-sensitive bubble menu - appears on text selection to provide instant access to formatting tools
- Text formatting options: bold, italic, underline, strikethrough
- Block formatting: headings H1/H2/H3 with toggle support
- Lists: bullet lists, ordered lists, task lists (checkboxes) with nested support and Tab/Shift+Tab indentation
- Link management: inline URL editor with auto-prefix `https://`, preserves existing Ctrl+Click behavior for opening links externally
- TipTap v3.22.3 rich-text engine with markdown shortcuts (e.g., `# Heading`, `- List`)
- Welcome note created automatically on first launch showcasing all available formatting (headings, bold, lists, task list, code, separator)
- Text color picker in bubble menu - 8 color swatches + reset, applies inline color to selected text
- Background highlight color picker in bubble menu - 8 color swatches + reset, highlights selected text
- Inline code button in bubble menu for quick code formatting

- Profile system: create and switch between multiple independent profiles (e.g. Personal / Work)
- Each profile has its own settings (API keys, hotkeys, language…), notes, transcription history and recordings
- Profile switcher at the bottom of the sidebar - shows current profile avatar with initials
- Create new profiles directly from the sidebar dropdown
- Manage profiles dialog: rename and delete profiles
- Profile switching reloads the interface without restarting the app (works in both dev and production)
- Automatic one-time migration: existing data moved into a default profile on first launch with this version
- Shared resources (Whisper models) remain common across all profiles

### 🔧 Changed
- Redesigned the note opening system
- Overhauled architecture frontend/backend

## [2.8.0] - 2026-04-11 (beta only)

### ✨ Added
- Release channel selection in settings - choose between Stable (default) for reliable updates or Beta for early access to new features
- Direct cursor insertion mode for transcribed text - text now types directly without disrupting your clipboard

### 🔧 Changed
- Link behavior in notes editor - links now require Ctrl+Click (Cmd+Click on Mac) to open, making it easier to select and copy link text
- Global navigation moved to a collapsible sidebar (History, Notes, Settings, Logs) replacing the top tab bar, giving each view more vertical space

### 🐛 Fixed
- Installation error on Windows machines without NVIDIA CUDA runtime - voice-tool.exe now installs successfully on all Windows systems

## [2.7.4] - 2026-04-09

### Changed
- Improved app settings storage by moving logs to a dedicated file system, keeping your configuration cleaner and the app running more efficiently

## [2.7.3] - 2026-04-05

### Fixed

- Correction d'un bug invalid date lors de la mise à jour

### Added
- Ajout d'un bouton de redimmensionnement de la note en demi écran
- Ajout d'un système de favoris pour les notes
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
[2.7.0]: https://github.com/Nolyo/voice-tool/compare/v2.6.0...v2.7.0
[2.6.0]: https://github.com/Nolyo/voice-tool/compare/v2.5.4...v2.6.0
[2.5.4]: https://github.com/Nolyo/voice-tool/compare/v2.5.3...v2.5.4
[2.5.3]: https://github.com/Nolyo/voice-tool/compare/v2.5.2...v2.5.3
[2.5.2]: https://github.com/Nolyo/voice-tool/compare/v2.5.1...v2.5.2
[2.5.1]: https://github.com/Nolyo/voice-tool/compare/v2.5.0...v2.5.1
[2.5.0]: https://github.com/Nolyo/voice-tool/compare/v2.0.0...v2.5.0
[2.0.0]: https://github.com/Nolyo/voice-tool/releases/tag/v2.0.0
