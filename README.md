# 🎙️ Voice Tool

Application desktop de **dictée vocale** propulsée par l'IA. Parlez dans votre micro, et la transcription est automatiquement collée dans la fenêtre active.

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

## 🚢 Release

```powershell
# Créer une release (déclenche la CI/CD)
git tag v2.x.x
git push origin v2.x.x
```

Un tag `v*` déclenche le workflow GitHub Actions qui build les installateurs (NSIS, MSI, portable), les signe, et publie sur GitHub Releases avec le fichier `latest.json` pour l'auto-updater.

## ⚠️ Notes importantes

- **Windows uniquement** pour le moment (extensible multi-plateforme)
- Le développement doit se faire **sous Windows natif** (pas WSL) pour l'accès au microphone
- Toujours utiliser `pnpm tauri build` pour les builds de production, pas `cargo build` seul
- L'UI est principalement en **français**
- Les clés de signature (`src-tauri/private.key`) sont dans les GitHub Secrets — voir [docs/UPDATER_SETUP.md](docs/UPDATER_SETUP.md)
