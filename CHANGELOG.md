## [3.0.0] - 2026-05-XX (en préparation)

> Major version. Voice Tool devient **Lexena**. Comptes utilisateurs et synchronisation cloud des settings, dictionnaire et snippets. La promesse de confiance reste intacte : le mode 100% local sans compte demeure gratuit et fonctionnel, et les clés API ne quittent jamais l'appareil.

### ✨ Added — Identité visuelle
- Rebrand complet **Voice Tool → Lexena** (binaire, identifiant `com.nolyo.lexena`, dossier `%APPDATA%/com.nolyo.lexena/`, scheme deep link `lexena://`)
- Nouvelle identité visuelle Lexena (icônes, couleurs, design tokens OKLCH, scope `.vt-app`)

### ✨ Added — Comptes utilisateurs (sub-épique 01)
- Création de compte par **magic link**, **email/password**, ou **Google OAuth**
- **2FA TOTP optionnel** activable depuis Settings > Sécurité (compatible Google Authenticator, Authy, Bitwarden, 1Password)
- **10 recovery codes** générés à l'activation 2FA, hashés SHA-256 côté serveur, consommables en cas de perte du device
- **Captcha Cloudflare Turnstile** au signup et au magic link pour limiter les abus
- **Vérification anti-pwned** : refus des passwords présents dans le top 10k des mots de passe leakés (liste embarquée, vérif locale)
- **Indicateur de force du mot de passe** au signup
- **Anti-énumération** : réponses identiques pour comptes connus et inconnus
- **Anti-Gmail-aliasing** : `user+tag@gmail.com` et `u.s.e.r@gmail.com` reconnus comme un seul compte
- **Blocklist domaines jetables** au signup
- **Email canonical unique** via trigger Postgres (un email réel = un seul compte)
- Stockage des sessions dans le **keyring OS** (Windows Credential Manager / macOS Keychain / Linux Secret Service) avec fallback memory-only si keyring indisponible
- **Suivi des devices connectés** : liste consultable dans Settings > Sécurité, avec OS, version d'app, dernière activité
- **Validation deep link Rust** anti-CSRF : nonce one-time, anti-replay, parsing JWT shape strict
- Écrans : `AuthModal`, `SignInPanel`, `SignupView`, `ResetPasswordRequest/Confirm`, `TwoFactorActivationFlow`, `TwoFactorChallengeView`, `RecoveryCodesPanel`

### ✨ Added — Synchronisation cloud (sub-épique 02)
- **Sync opt-in** des settings, du dictionnaire personnel et des snippets via Supabase EU
- **9 clés scalaires syncables** : thème, langue UI, 3 hotkeys, mode d'insertion, sons, provider transcription, taille modèle local
- **Last-Write-Wins par item** : conflits multi-device résolus au plus récent timestamp serveur
- **Soft-delete avec tombstones** pour propager proprement les suppressions
- **Backup local automatique** avant la première activation de sync
- **Queue offline persistante** : modifications hors-ligne mises en file FIFO, flush automatique à la reconnexion
- **Backoff + dead-letter queue** après 5 retries pour ne pas bloquer la queue sur erreur permanente
- **Banner UI quota dépassé** + page de gestion DLQ
- **Migration legacy** : les snippets/dico existants côté Tauri Store remontent automatiquement au mount
- **Edge Functions Supabase** : `sync-push` (validation Zod + quota), `account-export` (export GDPR)
- **Validation runtime des payloads cloud** côté client (Zod) — données malformées rejetées sans propagation
- Settings > Compte : toggle activation sync, état temps réel, backups locaux, lien export

### ✨ Added — Suppression de compte GDPR (sub-épique 02)
- **Bouton "Supprimer mon compte"** dans Settings > Sécurité avec confirmation forte
- **Grace period 30 jours** : tombstone créée, signOut global immédiat, écran `DeletionPendingScreen` au re-login avec bouton d'annulation
- **AAL2 obligatoire** si MFA activé : la suppression et l'annulation exigent une élévation TOTP
- **Cron Postgres quotidien** (`pg_cron` 03:00 UTC) : Edge Function `purge-account-deletions` purge réellement après 30j (cascade FK sur toutes les tables user)
- **Données locales nettoyées** : caches sync, backups locaux, recovery codes purgés au moment de la demande
- Données 100% locales (recordings, historique transcriptions, notes) conservées intentionnellement

### ✨ Added — Export GDPR
- Bouton "Exporter mes données" dans Settings > Compte
- Génère un JSON contenant `user_settings`, `user_dictionary_words`, `user_snippets`, `user_devices`
- Conforme art. 20 GDPR (portabilité)

### ✨ Added — Sécurité fondations (sub-épique 00)
- **Workflow CI `security-audit.yml`** : `pnpm audit` + `cargo audit` bloquants sur HIGH/CRITICAL (PR + cron quotidien)
- **Workflow CI `secret-scan.yml`** : scanner regex anti-leak (`sb_secret_*`, JWT service_role, PEM, `lsq_*`) sur les bundles frontend ET les binaires Tauri à chaque release
- **Workflow CI `ci.yml`** : Vitest + cargo test + Deno test + pgtap RLS (90 + 30 + Deno + RLS tests)
- **Tests pgtap RLS cross-tenant** sur les 5 tables synchronisées + recovery_codes + user_devices
- **Runbooks opérationnels** : rotation des secrets, test de restore backup, réponse à incident GDPR <72h, purge account deletion, investigation device fingerprint
- **Registre des traitements GDPR** + base légale par traitement
- **Bootstraps documentés** : Supabase EU, Cloudflare Pages, checklist 2FA tous comptes ops

### ✨ Added — Notes (continuité v2.x)
- **Tables Tiptap** dans les notes avec toolbar flottante
- **Code blocks avec coloration syntaxique** via `lowlight` + sélecteur de langage
- **Slash command menu** pour insérer des blocs (`/`)
- **Drag & drop des notes entre dossiers**
- **Dialog custom de création de dossier** (remplace le `prompt()` natif)
- **Note-to-note linking** (`@`) + backlinks panel + détection des liens cassés (rappel v2.10.1)

### ✨ Added — Historique
- **Pinned transcriptions** : épingler les transcriptions importantes en tête de liste
- **Export avancé + filtres** : recherche, plage de dates, format
- **Statistics dashboard** : onglet usage statistics avec métriques d'utilisation

### ✨ Added — Audio
- **Auto-trim silence** au début et à la fin des enregistrements (seuil adaptatif, logging détaillé)

### ✨ Added — UI / UX
- **Compact layout mode** pour les fenêtres étroites
- **Logs tab gated derrière developer mode** (Settings > Système)
- Filtres logs avancés (level + source)
- **Harmonisation feedback copy** : toast unifié `useCopyToClipboard` sur tous les boutons copier
- Preview/édition titres dans la mini fenêtre, sync settings au démarrage
- Slash menu et table toolbar polish

### 🔧 Changed
- **Architecture AppData** : refactor des chemins de stockage sous `%APPDATA%/com.nolyo.lexena/` avec migration depuis l'ancien `voice-tool/`
- **Settings sections** réorganisées + navigation simplifiée (Compte, Sécurité, Vocabulaire, etc.)
- Post-process mode selector simplifié
- Sidebar dashboard : icônes teintées slate
- Suppression de l'icône note redondante dans sidebar/tabs

### 🔒 Security
- **CORS Edge Functions verrouillé** sur les origines Tauri officielles (étaient `*` initialement)
- **Tests Deno unit** sur les Edge Functions critiques
- **Hardening 2FA** : élévation AAL2 + challenge TOTP exigés avant désactivation 2FA
- **Activation 2FA atomique** + `search_path` figé sur `pgcrypto`
- **PKCE flow** pour magic link / signup / recovery
- **Rate limiting** : table Postgres + RPC `check_rate_limit`, schedulé en daily purge, révoqué pour les rôles `anon`
- **Trigger** "nouveau device" : colonne `notified_at` + payload prêt pour Edge Function d'envoi email (envoi réel = follow-up)
- **Hardening Turnstile** : guard prod build, theme, UX submit
- **`.gitattributes`** : enforce LF line endings (élimine les warnings CRLF cross-OS)
- **Pin transitive deps** via `pnpm overrides` (CVE patch)
- Logs ciblés `lexena_lib=info,warn` (zéro PII serveur côté Edge Functions)

### 🐛 Fixed
- **Recovery codes consommables** : `consume_recovery_code` RPC élève la session à AAL2 (était unreachable avant le fix `20260601000500`)
- **2FA recovery flow** : `userId` correctement passé à `admin.mfa.deleteFactor`
- **Sync** : dequeue par ID après partial-success batch (perdait des opérations)
- **Sync** : respect du backoff + DLQ après 5 retries
- **Account deletion** : ne supprime la tombstone que si `deleteUser` a réussi
- **Account deletion** : signOut global tolérant aux erreurs + alerte avant signOut + a11y
- **Cron deletion** : utilise `supabase_vault` au lieu de GUCs + `pg_net` activé + `verify_jwt=false`
- **Notes** : placeholder body caché une fois la note non-vide
- **i18n** : phrase de confirmation reset password traduite (était hardcodée FR)
- **Deletion-pending screen** : clés CLDR plurals + bouton mode local + a11y
- **AuthContext** : `deletionPending` fetch protégé contre les writes async stales
- **Slash suggestion** : PluginKey distinct pour éviter collision avec NoteLink
- **Light mode** : support complet du design system `vt-app`
- **CI** : 4 jobs corrigés (pnpm conflict, deno lockfile, cargo target-dir, pgtap aal)
- **CI** : libs Linux ajoutées pour cpal/enigo/reqwest (alsa, xdo, ssl)

### 📚 Documentation
- **18 ADRs v3** figés (`docs/v3/decisions/0001-0012`)
- **3 sub-épiques figés** (00 sécurité, 01 auth, 02 sync) avec ADR de clôture chacun
- **Plans d'implémentation** : sub-épique 00, 01, 02, account deletion, post-review fixes, auth hardening
- **3 checklists E2E manuelles** (auth, sync, account deletion)
- **Runbooks opérationnels** (5 documents)
- **Registre GDPR + base légale + bootstraps**
- **Threat model + matrice d'implémentation** (livrée 2026-05-01)

### 🔧 Internal
- Lib crate renommé `lexena_lib`
- `.gitignore` couvre `.mcp.json`, plans intermédiaires
- Suppression deps non utilisées : `tauri-plugin-fs`, `tauri-plugin-shell`
- Ajout `bstr`, `normpath`, `opener`, `keyring`, `zod`, `vitest`, `supabase-cli`, `tauri-plugin-deep-link`

### ⚠️ Migration
- Recordings : auto-migration `voice-tool/recordings/` → `com.nolyo.lexena/recordings/` au premier lancement
- Pre-rebrand `com.nolyo.voice-tool/recordings/` : copie manuelle requise (pas d'auto-migration depuis l'ancien identifiant)
- Snippets/dico legacy (`settings.snippets`, `settings.dictionary`) : migration one-shot automatique au mount du recording workflow

### ❌ Removed
- Section Post Process retirée des settings
- Stats row redondante dans l'historique
- Icône note redondante de la sidebar/tabs
- Anciens MSI et installers portable (un seul installer NSIS distribué — rappel v2.10.0)

### 🗒️ Note
- v3.0 communiquée comme **"Public Beta"** lors du soft launch
- Plan Supabase **Free** (Pro reporté post-traction selon posture launch v3.0 free-tier first)
- **Audit sécurité externe** prévu post-traction (>50 users sync), pas bloquant pour soft launch
- **Privacy Policy** + **Terms of Service** + **Mentions légales** publics : drafts FR + EN livrés `docs/v3/legal/`, publication en ligne dépend du domaine final (sous-épique 06)
- **Plan Supabase Pro upgrade** : prérequis pour PITR + DPA officiel + sessions Time-box

---

## [2.10.1] - 2026-04-22

### ✨ Added
- New System of dark / light themes with automatic switching based on system preferences.
- In parameters, you can now delete your data (recordings, transcriptions, notes) without uninstalling the app.
- Note-to-note linking: type `@` in any note to link to another note, with auto-complete by title
- Broken links (when the target note is deleted) are shown in red with a one-click dialog to recreate the missing note
- Backlinks panel at the bottom of each note ("Mentioned in") listing all notes that reference it
- Middle-click to close tabs in notes

### 🐛 Fixed
- Enhance Markdown handling in AI assistant with Turndown and Marked integration (preserve line breaks, support tables, code blocks, lists)

### 🔧 Changed
- Improved layout and styling of Transcription history

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
