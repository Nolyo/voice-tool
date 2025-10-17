# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Python voice transcription tool that captures audio through global hotkeys and transcribes it using Google Cloud Speech-to-Text. The application runs as a system tray application with real-time audio visualization and a configuration interface.

## Core Architecture

### Main Components

- **main.py**: Core application orchestrator handling:
  - Audio recording with sounddevice
  - Google Cloud Speech-to-Text integration
  - Global hotkey management via pynput
  - System tray integration with pystray
  - Threading coordination between GUI and audio processing

- **gui_tkinter.py**: Tkinter-based GUI system providing:
  - Real-time audio level visualization during recording
  - Main interface with tabbed layout (History & Logs, Settings)
  - Thread-safe log message display
  - Transcription history management

### Key Technical Patterns

- **Multi-threading Architecture**: Main thread handles pystray, separate daemon thread runs Tkinter GUI
- **Thread-safe Communication**: Uses `tkinter.after()` for cross-thread UI updates
- **Global State Management**: Shared variables coordinated through main.py module globals
- **Audio Processing Pipeline**: sounddevice → numpy arrays → scipy.io.wavfile → Google Cloud API

## Development Commands

### Running the Application

```bash
# Development mode (with console output)
python main.py --console

# Production mode (background process, logs to voice_tool.log)
python main.py
```

### Dependencies

Install requirements with:
```bash
pip install -r requirements.txt
```

Required packages: pynput, sounddevice, scipy, pystray, Pillow, google-cloud-speech, python-dotenv, pyperclip, PySide6

## Configuration

### Environment Variables (.env file required)
- `PROJECT_ID`: Google Cloud project ID
- `PRIVATE_KEY_ID`: Service account private key ID  
- `PRIVATE_KEY`: Service account private key (with \n escaped)
- `CLIENT_EMAIL`: Service account email
- `CLIENT_ID`: Service account client ID

### Runtime Configuration (config.json)
- `record_hotkey`: Global hotkey for recording toggle (default: "<ctrl>+<alt>+s")
- `open_window_hotkey`: Global hotkey for opening main interface (default: "<ctrl>+<alt>+o")

## Key Implementation Details

### Audio Processing
- Sample rate: 44100 Hz, mono channel, int16 format
- Real-time level calculation using RMS values
- Audio visualization with 40-bar level display

### Google Cloud Integration
- Uses service account credentials from environment variables
- Configured for French language ("fr-FR") with automatic punctuation
- Uses "latest_long" model for better accuracy

### GUI Architecture
- Main window hidden by default, visualizer window shows during recording
- Drag-and-drop functionality for visualizer positioning
- Thread-safe logging integration with custom GuiLoggingHandler class

### Process Management
- Auto-detaches to background process on Windows using pythonw.exe
- Console mode available for development with --console flag
- Proper cleanup handling for audio streams and hotkey listeners

## Common Issues

- Ensure Google Cloud credentials are properly configured in .env
- Audio device permissions may be required on some systems
- Global hotkeys may conflict with other applications