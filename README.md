# 🎙️ Voice Tool

Application desktop de **dictée vocale** propulsée par l'IA. Parlez dans votre micro, et la transcription est automatiquement collée dans la fenêtre active.

## 📋 Sommaire

- [Fonctionnalités](#-fonctionnalités)
- [Stack technique](#️-stack-technique)
- [Prérequis](#-prérequis)
- [Démarrage rapide](#-démarrage-rapide)
- [Commandes utiles](#-commandes-utiles)
- [Transcription locale avec Whisper.cpp](#-transcription-locale-avec-whispercpp-optionnel)
- [Créer une nouvelle release](#-créer-une-nouvelle-release)
- [Notes importantes](#️-notes-importantes)

## ✨ Fonctionnalités

- 🎤 Enregistrement audio via micro système
- 📊 Visualisation audio temps réel (fenêtre principale + mini fenêtre flottante)
- 🗣️ Double transcription : **OpenAI Whisper** (batch) et **Deepgram** (streaming temps réel)
- 🔤 Transcription locale via **whisper.cpp** (optionnel, sans API)
- ⌨️ Raccourcis globaux configurables (toggle, push-to-talk, afficher fenêtre)
- 📋 Auto-collage de la transcription dans la fenêtre active
- 🔄 Mise à jour automatique avec signature cryptographique
- 💾 Historique des transcriptions
- 🖥️ Architecture multi-fenêtres (dashboard + mini visualiseur)
- 🔔 Intégration barre système (system tray)

## 🛠️ Stack technique

| Couche | Technologies |
|--------|-------------|
| **Frontend** | React 19, TypeScript, Tailwind CSS v4, Vite |
| **Backend** | Rust, Tauri v2, cpal (audio), enigo (clavier) |
| **Package manager** | pnpm |
| **Build/CI** | GitHub Actions, NSIS/MSI/portable |

## 📦 Prérequis

### 1. Node.js

Téléchargez et installez [Node.js](https://nodejs.org/) (version LTS recommandée).

### 2. pnpm

```powershell
npm install -g pnpm
```

### 3. Rust

Installez Rust via [rustup](https://rustup.rs/). L'installeur configurera `rustc`, `cargo` et `rustup`.

### 4. Visual Studio Build Tools (Windows)

Rust a besoin du linker MSVC (`link.exe`) pour compiler sur Windows.

1. Téléchargez les [Build Tools for Visual Studio](https://visualstudio.microsoft.com/fr/visual-cpp-build-tools/)
2. Dans l'installeur, cochez le workload **"Développement Desktop en C++"**
3. Lancez l'installation

> **💡 Astuce** : L'installeur `rustup` propose normalement d'installer les Build Tools automatiquement. Si vous les avez refusés, suivez les étapes ci-dessus.

> **⚠️ Important** : Après l'installation de Rust et des Build Tools, **relancez votre terminal / VS Code** pour que le PATH soit mis à jour.

### 5. IDE recommandé

- [VS Code](https://code.visualstudio.com/) avec les extensions :
  - [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
  - [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 🚀 Démarrage rapide

```powershell
# Installer les dépendances
pnpm install

# Lancer en mode développement
pnpm tauri dev

# Build de production
pnpm tauri build
```

> La première compilation Rust prend plusieurs minutes (téléchargement et compilation des dépendances). Les suivantes sont rapides grâce au cache.

## 🔧 Commandes utiles

```powershell
# Frontend uniquement (Vite dev server, port 1420)
pnpm dev

# Build frontend uniquement
pnpm build

# Vérification Rust (rapide, sans compilation complète)
cd src-tauri && cargo check

# Générer les clés de signature (une seule fois)
pnpm tauri signer generate --write-keys src-tauri/private.key --ci -p ""
```

## 📡 Transcription locale avec Whisper.cpp (optionnel)

L'application supporte la transcription locale via [whisper.cpp](https://github.com/ggerganov/whisper.cpp) en utilisant le pattern **Sidecar** de Tauri.

### Installation

1. **Télécharger le binaire** depuis les [releases de whisper.cpp](https://github.com/ggerganov/whisper.cpp/releases) :
   - Windows : `whisper-bin-x64.zip` (contient `whisper-cli.exe`)

2. **Placer le binaire** dans `src-tauri/binaries/` en le renommant :

   ```
   src-tauri/binaries/
   ├── whisper-cli-x86_64-pc-windows-msvc.exe
   └── whisper.dll    # Windows uniquement
   ```

   > Le suffixe doit correspondre au **target triple** de Rust.

3. **Configuration Tauri** — Le fichier `tauri.conf.json` doit déclarer le sidecar :

   ```json
   {
     "bundle": {
       "externalBin": ["binaries/whisper-cli"]
     }
   }
   ```

### Modèles Whisper

Les modèles sont téléchargés automatiquement depuis Hugging Face lors de la première utilisation. Stockage : `%APPDATA%/com.nolyo.voice-tool/models/`

| Modèle | Taille  | RAM requise |
|--------|---------|-------------|
| tiny   | ~75 Mo  | ~1 Go       |
| base   | ~142 Mo | ~1 Go       |
| small  | ~466 Mo | ~2 Go       |
| medium | ~1.5 Go | ~5 Go       |
| large  | ~3 Go   | ~10 Go      |

## 🚢 Créer une nouvelle release

### Étape 1 — Bumper la version

Lancer le script de bump depuis la racine du projet (nécessite Git Bash ou WSL) :

```bash
.github/scripts/bump-version.sh 2.x.x
```

Ce script met à jour la version dans `package.json`, `src-tauri/Cargo.toml` et `src-tauri/tauri.conf.json`.

### Étape 2 — Régénérer le Cargo.lock

Cette étape n'est plus nécessaire, le Cargo.Lock est généré dans le bump-version.sh

### Étape 3 — Commit et push

```powershell
git add -A
git commit -m "chore: bump version to 2.x.x"
git push
```

### Étape 4 — Build signé local (et release GitHub)

Lancer le script de release qui build avec signature, génère les artefacts et publie la release sur GitHub :

```powershell
.\release.ps1
```

Ce script :
1. Lit la version depuis `tauri.conf.json`
2. Charge la clé privée (`src-tauri/private.key`)
3. Build les installateurs signés (NSIS, MSI, portable)
4. Crée le tag Git `vX.Y.Z` et le pousse
5. Publie la release sur GitHub avec les artefacts et le `latest.json` pour l'auto-updater

> **Prérequis** : La clé privée doit être présente dans `src-tauri/private.key` et `gh` (GitHub CLI) doit être authentifié.

> Pour un build signé local **sans** publier de release, utiliser `build-signed.ps1` à la place.

## Créer une beta release

```powershell
.github\scripts\bump-version.sh -beta 2.1.0-beta.1

git add -A ; git commit -m "chore: bump version to 2.8.0-beta.1"
git push

.\release.ps1 -Prerelease
```

## ⚠️ Notes importantes

- **Windows uniquement** pour le moment (extensible multi-plateforme)
- Le développement doit se faire **sous Windows natif** (pas WSL) pour l'accès au microphone
- Toujours utiliser `pnpm tauri build` pour les builds de production, pas `cargo build` seul
- L'UI est principalement en **français**
- Les clés de signature (`src-tauri/private.key`) sont dans les GitHub Secrets — voir [docs/UPDATER_SETUP.md](docs/UPDATER_SETUP.md)
