# Voice Tool 🎤

[![Python 3.8+](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Google Cloud](https://img.shields.io/badge/Google%20Cloud-Speech--to--Text-4285F4)](https://cloud.google.com/speech-to-text)

**AI-powered voice transcription tool with global hotkeys and real-time audio visualization**

Voice Tool is a modern desktop application that transforms speech into text using Google Cloud Speech-to-Text API. Built with a focus on productivity, it features global hotkeys, real-time audio visualization, and seamless integration with your workflow.

---

## ✨ About

Voice Tool was developed through **vibe-coding** sessions using [Claude Code](https://claude.ai/code), showcasing the power of AI-assisted development. The application evolved iteratively through collaborative coding with AI, resulting in a polished, feature-rich voice transcription solution.

### Key Features

🎯 **Global Hotkeys** - Record from anywhere with `Ctrl+Alt+S`  
📊 **Real-time Visualizer** - Beautiful audio level visualization during recording  
📋 **Smart Clipboard** - Automatic copy to clipboard with optional cursor pasting  
🎨 **Modern UI** - Clean, intuitive interface with system tray integration  
📚 **Persistent History** - All transcriptions saved with timestamps  
⚙️ **User Settings** - Customizable preferences stored in AppData  
🔊 **Audio Feedback** - Subtle sound cues for recording start/stop  
💼 **Background Operation** - Runs silently in the system tray  

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

5. **Launch the application**
   ```bash
   # Console mode (for development/testing)
   python main.py --console
   
   # Background mode (production)
   python main.py
   ```

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

Create a `.env` file in the project root:

```env
# Google Cloud Speech-to-Text Configuration
PROJECT_ID=your-google-cloud-project-id
PRIVATE_KEY_ID=your-private-key-id-from-json
PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nYour-actual-private-key-content\n-----END PRIVATE KEY-----
CLIENT_EMAIL=your-service-account-email@project.iam.gserviceaccount.com
CLIENT_ID=your-client-id-from-json-file
```

### System Settings (config.json)

Technical/system settings stored in `config.json` (project root):

```json
{
  "record_hotkey": "<ctrl>+<alt>+s",
  "open_window_hotkey": "<ctrl>+<alt>+o"
}
```

**System settings include**:
- Global keyboard shortcuts
- Technical configuration parameters

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

**User preferences include**:
- Interface sounds on/off
- Auto-paste to cursor behavior
- Future customization options

> **Migration**: If you have an existing installation, user preferences will be automatically migrated from `config.json` to AppData on first launch.

---

## 🎮 Usage

### Launching the Application

**Option 1: Using Batch Files (Windows)**
- **Background Mode**: Double-click `Voice Tool (Background).bat`
- **Console Mode**: Double-click `Voice Tool (Console).bat`

**Option 2: Command Line**
```bash
# Background mode (silent)
python main.py

# Console mode (with debug output)
python main.py --console
```

### Controls

| Hotkey | Action |
|--------|--------|
| `Ctrl+Alt+S` | Start/Stop recording |
| `Ctrl+Alt+O` | Open main interface |

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

### Batch Files

The project includes pre-configured batch files for easy launching:

**`Voice Tool (Background).bat`**
```batch
@echo off
powershell -WindowStyle Hidden -Command "Set-Location '\\wsl$\Ubuntu\home\nolyo\www\voice-tool'; python main.py"
```

**`Voice Tool (Console).bat`**  
```batch
@echo off
powershell -Command "Set-Location '\\wsl$\Ubuntu\home\nolyo\www\voice-tool'; python main.py --console"
pause
```

### System-wide Access

To launch Voice Tool from anywhere in Windows:

1. **Copy batch files** to a folder in your PATH (e.g., `C:\Tools\`)
2. **Update paths** in batch files to match your installation
3. **Create shortcuts** on Desktop or in Start Menu
4. **Add to startup** for automatic launch

### Auto-start Setup

Add to Windows startup:
1. Press `Win+R`, type `shell:startup`
2. Copy `Voice Tool (Background).bat` to the startup folder
3. Voice Tool will launch automatically on Windows boot

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

### Debug Mode

Run in console mode to see detailed logs:
```bash
python main.py --console
```

Logs are also written to `voice_tool.log` in background mode.

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