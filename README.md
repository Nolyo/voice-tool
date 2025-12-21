# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Build avec Whisper.cpp (Transcription Locale)

L'application supporte la transcription locale via [whisper.cpp](https://github.com/ggerganov/whisper.cpp). Cette fonctionnalité utilise le pattern **Sidecar** de Tauri : un binaire précompilé est embarqué dans l'application.

### Prérequis

1. **Télécharger le binaire whisper-cli**

   Téléchargez le binaire précompilé depuis les [releases de whisper.cpp](https://github.com/ggerganov/whisper.cpp/releases). Choisissez la version correspondant à votre plateforme :
   - Windows : `whisper-bin-x64.zip` (contient `whisper-cli.exe`)
   - Linux : `whisper-bin-ubuntu-x64.zip`
   - macOS : `whisper-bin-macos-x64.zip` ou `whisper-bin-macos-arm64.zip`

2. **Placer le binaire dans le projet**

   Renommez le binaire selon la convention Tauri et placez-le dans `src-tauri/binaries/` :

   ```
   src-tauri/binaries/
   └── whisper-cli-x86_64-pc-windows-msvc.exe   # Windows
   └── whisper-cli-x86_64-unknown-linux-gnu     # Linux
   └── whisper-cli-x86_64-apple-darwin          # macOS Intel
   └── whisper-cli-aarch64-apple-darwin         # macOS Apple Silicon
   ```

   > **Note** : Le suffixe doit correspondre au **target triple** de Rust. Tauri ajoute automatiquement ce suffixe lors de l'exécution.

3. **DLL supplémentaires (Windows uniquement)**

   Sur Windows, copiez également `whisper.dll` dans le dossier `src-tauri/binaries/`.

### Configuration Tauri

Le fichier `tauri.conf.json` doit déclarer le sidecar :

```json
{
  "bundle": {
    "externalBin": [
      "binaries/whisper-cli"
    ]
  }
}
```

### Modèles Whisper

Les modèles sont téléchargés automatiquement depuis Hugging Face lors de la première utilisation. Ils sont stockés dans :
- Windows : `%APPDATA%/com.nolyo.voice-tool/models/`
- Linux/macOS : `~/.config/com.nolyo.voice-tool/models/`

Modèles disponibles :
| Modèle | Taille | RAM requise |
|--------|--------|-------------|
| tiny   | ~75 Mo | ~1 Go       |
| base   | ~142 Mo| ~1 Go       |
| small  | ~466 Mo| ~2 Go       |
| medium | ~1.5 Go| ~5 Go       |
| large  | ~3 Go  | ~10 Go      |

### Build

```bash
# Installation des dépendances
pnpm install

# Développement
pnpm tauri dev

# Build de production
pnpm tauri build
```
