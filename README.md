# Voice Tool 🎤

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Google Cloud](https://img.shields.io/badge/Google%20Cloud-Speech--to--Text-4285F4)](https://cloud.google.com/speech-to-text)

**AI-powered voice transcription tool with global hotkeys and real-time audio visualization**

Voice Tool is a modern desktop application that transforms speech into text using Google Cloud Speech-to-Text API (and optionally OpenAI Whisper). Built with a focus on productivity, it features configurable global hotkeys (toggle/PTT), real-time audio visualization, and seamless integration with your workflow.

---

## ✨ About

Voice Tool was developed through **vibe-coding** sessions using [Claude Code](https://claude.ai/code), showcasing the power of AI-assisted development. The application evolved iteratively through collaborative coding with AI, resulting in a polished, feature-rich voice transcription solution.

### Key Features

🎯 **Configurable Global Hotkeys** - Toggle or Push‑to‑talk modes (defaults: `Ctrl+Alt+S` toggle, `Ctrl+Shift+Space` PTT)  
📊 **Real-time Visualizer** - Beautiful audio level visualization during recording  
📋 **Smart Clipboard** - Automatic copy to clipboard with optional cursor pasting  
🎨 **Modern UI** - Clean, intuitive interface with system tray integration  
📚 **Persistent History** - All transcriptions saved with timestamps  
⚙️ **User Settings** - Customizable preferences stored in AppData  
🔊 **Audio Feedback** - Packaged WAV assets; fallback generation in AppData  
💼 **Background Operation** - Runs silently in the system tray  
🪟 **Windows One‑File EXE** - Single executable for distribution, with `--debug` mode and splash screen  

---

## 🚀 Installation & Setup

### Prerequisites

- **Python 3.8+** - [Download here](https://www.python.org/downloads/)
- **Google Cloud Account** - For Speech-to-Text API access
- **Windows 10/11** - (Primary target, but cross-platform compatible)

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/voice-tool.git
   cd voice-tool
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up Google Cloud** (see detailed guide below)

4. **Configure environment variables**
   ```bash
   # Create .env file with your Google Cloud credentials
   cp .env.example .env
   # Edit .env with your actual values
   ```

5. **Launch the application (development)**
   ```bash
   # Console mode (for development/testing)
   python main.py --console
   
    # Background mode
    python main.py

---

## 📦 Production (Windows, one‑file EXE)

### End‑user usage

1) Place your `.env` next to `Voice Tool.exe` (or in `%APPDATA%\VoiceTool\.env`).  
2) Double‑click `Voice Tool.exe`. The app runs in the tray (right‑click the icon for menu).  
3) Optional debug: run with `--debug` to see verbose logs and open the UI directly:  
   `"C:\\path\\to\\Voice Tool.exe" --debug`

Environment lookup priority (first found wins; files are only read, never written):
- `--env <path>` (CLI override)
- `.env` in the executable directory
- `%APPDATA%\\VoiceTool\\.env`
- System environment variables
- `.env` at project root (development only)

Google credentials fallback: if detailed vars are missing, you can set  
`GOOGLE_APPLICATION_CREDENTIALS=C:\\path\\to\\service-account.json`  
to load the full JSON directly.

Logs and data are in `%APPDATA%\\VoiceTool` (`voice_tool.log`, `user_settings.json`, `recordings/`, `sounds/`).

### Building the EXE (maintainers)

From `C:\\voice-tool` with a fresh virtualenv and dependencies installed:

- Using Makefile:
  ```powershell
  make build-exe
  ```
- Or directly with PyInstaller:
  ```powershell
  .\\.venv\\Scripts\\pTest du mode continue OK.ython.exe -m PyInstaller --clean --noconfirm packaging/pyinstaller/voice_tool.spec
  ```
- Output: `dist\\Voice Tool.exe` (one‑file). Prefer `--distpath bin` to output to `bin\\`:
  ```powershell
  .\\.venv\\Scripts\\python.exe -m PyInstaller --clean --noconfirm --distpath bin packaging/pyinstaller/voice_tool.spec
  ```

Notes:
- Spec file: `packaging/pyinstaller/voice_tool.spec` (no reliance on `__file__` at runtime).  
- Assets `voice_tool/assets/sounds/*.wav` are included and copied to AppData if needed.
   ```

---

## 🛠️ CI/CD (GitHub Actions)

This repo ships with two GitHub Actions workflows:

- `CI` (`.github/workflows/ci.yml`):
  - Lints with Ruff + Black (Ubuntu)
  - Builds the Windows one‑file EXE with PyInstaller and uploads it as a build artifact

- `Release` (`.github/workflows/release.yml`):
  - Triggers on tags matching `v*` (e.g. `v1.2.3`)
  - Builds the Windows EXE, zips it with basic docs, generates SHA256 checksum
  - Publishes a GitHub Release with the ZIP attached

### How to cut a release

1. Ensure `mep` or `main` has your latest commits
2. Create and push a tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
3. The Release workflow will publish `Voice-Tool-v1.0.0-windows-x64.zip`

Optional improvements (future):
- Add code signing (Windows `signtool`) using a certificate stored in GitHub Secrets
- Add Linux/macOS builds via a matrix (PyInstaller per OS)
- Auto‑changelog generation (e.g. Release Please or conventional commits)

---

## ☁️ Google Cloud Setup

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Note your **Project ID**

### Step 2: Enable Speech-to-Text API

1. In the Console, navigate to **APIs & Services > Library**
2. Search for "Speech-to-Text API"
3. Click **Enable**

### Step 3: Create Service Account

1. Go to **IAM & Admin > Service Accounts**
2. Click **Create Service Account**
3. Fill in details:
   - **Name**: `voice-tool-service`
   - **Description**: `Service account for Voice Tool application`
4. Click **Create and Continue**
5. Grant **Speech Client** role
6. Click **Done**

### Step 4: Generate Credentials

1. Click on your newly created service account
2. Go to **Keys** tab
3. Click **Add Key > Create New Key**
4. Choose **JSON** format
5. Download the file (keep it secure!)

### Step 5: Extract Values for .env

Open the downloaded JSON file and extract these values:

```env
PROJECT_ID=your-project-id-here
PRIVATE_KEY_ID=your-private-key-id-here
PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nYour-private-key-content-here\n-----END PRIVATE KEY-----
CLIENT_EMAIL=your-service-account@project-id.iam.gserviceaccount.com
CLIENT_ID=your-client-id-here
```

**Important**: In `PRIVATE_KEY`, replace actual newlines with `\n`

---

## ⚙️ Configuration

### Environment Variables (.env)

Development: create a `.env` in the project root.  
Production: place `.env` next to the EXE or in `%APPDATA%\\VoiceTool\\.env`.  
CLI override any location with `--env C:\\path\\to\\.env`.

```env
# Google Cloud Speech-to-Text Configuration
PROJECT_ID=your-google-cloud-project-id
PRIVATE_KEY_ID=your-private-key-id-from-json
PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nYour-actual-private-key-content\n-----END PRIVATE KEY-----
CLIENT_EMAIL=your-service-account-email@project.iam.gserviceaccount.com
CLIENT_ID=your-client-id-from-json-file
```

Or provide only a service account JSON in production:

```env
GOOGLE_APPLICATION_CREDENTIALS=C:\\Users\\You\\Documents\\voice-tool-sa.json
```

OpenAI Whisper (optional alternative provider):

```env
OPENAI_API_KEY=sk-...your_key...
```

### System Settings (config.json, optional)

System config at the project root is optional and not auto‑created in production.  
Global hotkeys and user options have migrated to user settings (see below).

### User Preferences (AppData)

Personal preferences automatically saved to:
- **Windows**: `%APPDATA%\VoiceTool\user_settings.json`
- **Linux/Mac**: `~/.config/VoiceTool/user_settings.json`

```json
{
  "version": "1.0",
  "created": "2025-01-06 12:34:56",
  "settings": {
    "enable_sounds": true,
    "paste_at_cursor": false
  }
}
```

**User preferences include** (non‑exhaustive):
- `enable_sounds`, `paste_at_cursor`, `smart_formatting`
- `transcription_provider` (`Google` or `OpenAI`), `language` (e.g. `fr-FR`)
- `record_mode` (`toggle` or `ptt`), `record_hotkey`, `ptt_hotkey`, `open_window_hotkey`
- `input_device_index`, `recordings_keep_last`

> **Migration**: If you have an existing installation, user preferences will be automatically migrated from `config.json` to AppData on first launch.

---

## 🎮 Usage

### Launching the Application

**Production (EXE)**

- Double‑click `Voice Tool.exe` (runs in tray).  
- Optional: `"C:\\path\\to\\Voice Tool.exe" --debug` to open UI and show verbose logs.

**Development (Python)**
```bash
# Background mode (silent)
python main.py

# Console mode (with debug output)
python main.py --console
```

### Controls

| Hotkey | Action |
|--------|--------|
| `Ctrl+Alt+S` | Start/Stop recording (Toggle mode) |
| `Ctrl+Shift+Space` | Push‑to‑talk (while held), when PTT mode is selected |
| `Ctrl+Alt+O` | Open main interface |

Notes:
- Recording mode (Toggle/PTT) and all hotkeys are configurable in Settings.

### Interface

- **System Tray**: Right-click for menu options
- **Audio Visualizer**: Appears during recording (bottom of screen)
- **Main Window**: Access history, logs, and settings
- **Settings Tab**: Customize hotkeys, sounds, and auto-paste behavior

---

## 📁 Project Structure

```
voice-tool/
├── main.py                     # Core application orchestrator
├── gui_tkinter.py              # Tkinter-based GUI system
├── requirements.txt            # Python dependencies
├── config.json                 # System configuration
├── .env                        # Google Cloud credentials (create this)
├── CLAUDE.md                   # Development context for Claude Code
├── Voice Tool (Background).bat # Windows launcher (background)
├── Voice Tool (Console).bat    # Windows launcher (console)
└── voice_tool_icon.ico         # Application icon
```

### Core Architecture

- **Multi-threading**: Main thread handles system tray, GUI runs in separate daemon thread
- **Thread-safe Communication**: Uses `tkinter.after()` for cross-thread UI updates
- **Audio Pipeline**: sounddevice → numpy → scipy → Google Cloud Speech-to-Text
- **Persistent Storage**: JSON files in AppData for settings and history

---

## 🪟 Windows Integration

### System Tray & Startup

- The app runs in the Windows system tray. Right‑click the tray icon for: Open, Open logs folder, Quit.  
- To auto‑start with Windows, create a shortcut to the EXE in `shell:startup`. An installer (Inno Setup) will provide this option later.

---

## 🔧 Troubleshooting

### Common Issues

**"No audio device found"**
- Check microphone permissions
- Verify audio input device in Windows settings
- Try running as administrator

**"Google Cloud authentication failed"**
- Verify `.env` file exists and is properly formatted
- Check Google Cloud project has Speech-to-Text API enabled
- Ensure service account has proper permissions

**"Global hotkeys not working"**
- Run as administrator
- Check for conflicting hotkeys with other applications
- Modify hotkeys in settings if needed

**"Transcription is empty"**
- Speak clearly and loudly enough
- Check internet connection
- Verify microphone is not muted

### Debug & Logs

Production: `"C:\\path\\to\\Voice Tool.exe" --debug`  
Development: `python main.py --console`

Logs: `%APPDATA%\\VoiceTool\\voice_tool.log` (tray menu → Open logs folder).

---

## 🤝 Contributing

Voice Tool was built through collaborative AI-assisted development using Claude Code. The development process showcased:

- **Iterative refinement** through conversational coding
- **Real-time problem solving** with AI assistance  
- **Code quality improvement** through AI code review
- **Documentation generation** with AI help

Feel free to contribute by:
- Reporting bugs and issues
- Suggesting new features
- Submitting pull requests
- Improving documentation

### Development Setup

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

## 📄 License & Credits

**License**: MIT License - see [LICENSE](LICENSE) file for details

**Credits**:
- Developed with [Claude Code](https://claude.ai/code) - AI-powered coding assistant
- Google Cloud Speech-to-Text for transcription engine
- Python community for excellent libraries

---

## 🙏 Acknowledgments

Special thanks to **Claude Code** for being an exceptional AI coding partner throughout the development process. This project demonstrates the potential of human-AI collaboration in software development.

---

*Built with ❤️ and AI assistance*