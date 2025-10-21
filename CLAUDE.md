# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Tauri-based desktop voice recording application with real-time audio visualization and AI-powered transcription. The application features:
- Audio capture from system microphones using Rust (cpal library)
- Real-time audio level visualization
- OpenAI Whisper API integration for transcription
- Configurable global keyboard shortcuts (toggle, push-to-talk, show window)
- Multi-window architecture with a main dashboard and floating mini visualizer
- System tray integration with hide-to-tray behavior
- Persistent settings and transcription history using Tauri Store plugin
- Auto-paste transcriptions to active window via keyboard simulation
- Structured logging from Rust to frontend

## Development Commands

### Running the Application
```bash
pnpm tauri dev
```
This runs both the Vite dev server (frontend) and Tauri development build (Rust backend).

### Building for Production
```bash
pnpm build           # Build frontend (TypeScript compilation + Vite build)
pnpm tauri build     # Build complete application bundle
```
**IMPORTANT**: Always use `pnpm tauri build` for production builds, NOT `cargo build`. The Tauri CLI orchestrates the full build process including frontend bundling.

### Frontend Only
```bash
pnpm dev            # Vite dev server only (port 1420)
pnpm build          # TypeScript + Vite build
```

### Rust Only
```bash
cd src-tauri
cargo build         # Debug build
cargo check         # Fast type checking
```

## Architecture

### Multi-Window System

The application uses a dual-window architecture:

1. **Main Window** (`index.html` → `src/main.tsx` → `App.tsx`)
   - Full dashboard with recording controls and transcription history
   - Settings dialog for API configuration, hotkeys, and preferences
   - Hides to system tray on close (doesn't quit)
   - Window state (position, size, maximized/minimized) is persisted via Tauri Store
   - Standard window decorations

2. **Mini Window** (`mini.html` → `src/mini-window.tsx`)
   - Floating audio visualizer (233x42px by default, resizable)
   - Pre-created at startup but hidden by default
   - Shows/hides on recording toggle
   - Positioned at bottom-center of current monitor with 32px margin
   - Transparent, frameless, always-on-top
   - Displays real-time audio bars with recording timer
   - Receives "audio-level" and "recording-state" events from Rust backend

Both windows are defined in Vite's multi-page configuration (`vite.config.ts` rollupOptions.input).

### Rust Backend Architecture

Located in `src-tauri/src/`:

- **`main.rs`**: Entry point, delegates to library
- **`lib.rs`**: Tauri setup, window management, global shortcuts, system tray, window state persistence, and all Tauri command handlers
- **`audio.rs`**: Audio recording implementation using cpal with stream lifecycle management
- **`transcription.rs`**: Audio file I/O (WAV), OpenAI Whisper API integration, recordings cleanup, and legacy directory migration
- **`logging.rs`**: Custom tracing layer that emits structured logs to frontend via Tauri events

#### Audio Recording Flow

1. **Device Selection**: `get_audio_devices()` lists available input devices via cpal with default device detection
2. **Recording Start**:
   - `start_recording()` increments stream ID counter, clears buffer, builds audio stream
   - Stream uses `std::mem::forget()` to keep it alive (intentional leak)
   - Stream ID mechanism prevents old stream callbacks from interfering when restarting
   - Audio callback runs continuously, converting samples to i16, calculating RMS
   - Handles mono/stereo/multi-channel → mono conversion via averaging
   - Emits "audio-level" events (0-1 normalized, 50x amplification) for real-time visualization
   - Uses device native sample rate for compatibility (16000, 44100, 48000, etc.)
3. **Recording Stop**:
   - Sets `is_recording` flag to false (stops callback processing)
   - Waits 50ms for stream to stop
   - Returns captured i16 samples from buffer along with sample rate

#### Global Shortcuts Architecture

Located in `lib.rs:458-588`:

The application supports three configurable hotkeys:
- **Toggle Recording** (default: Ctrl+F11): Start/stop recording, show/hide mini window
- **Push-to-Talk** (default: Ctrl+F12): Record while pressed, transcribe on release
- **Open Window** (default: Ctrl+Alt+O): Show and focus main window

**Hotkey Management Flow**:
1. Hotkeys loaded from settings store on startup (`load_hotkey_config`)
2. Frontend can update hotkeys via `update_hotkeys()` command
3. Conflict validation prevents duplicate shortcuts
4. On update, old shortcuts are unregistered, new ones registered
5. Rollback on failure to maintain working state
6. Hotkey handlers use shared helper functions (`start_recording_shortcut`, `stop_recording_shortcut`, `show_mini_window`, `hide_mini_window`)

**Recording from Shortcuts**:
- Toggle/PTT shortcuts trigger audio capture in Rust
- On stop, audio samples emitted via "audio-captured" event to frontend
- Frontend's Dashboard listens and auto-transcribes via `transcribe_audio()` callback

#### Window State Persistence

Located in `lib.rs:209-336`:

- Main window geometry (size + position) and state (normal/maximized/minimized) saved to Tauri Store
- Geometry only saved when in "normal" state (not maximized/minimized)
- Uses WIDTHxHEIGHT+X+Y format for storage
- Window state restored on app launch before showing window
- Changes captured on resize, move, and close events
- Supports `--minimized` flag for autostart without showing window

#### Transcription and Keyboard Paste

Located in `lib.rs:633-729` and `transcription.rs`:

**Transcription Flow**:
1. Frontend calls `transcribe_audio()` with samples, sample rate, API key, language, keep_last count
2. Audio saved to WAV file in `%APPDATA%/com.nolyo.voice-tool/recordings/` with timestamp filename
3. Legacy recordings directory (`%APPDATA%/voice-tool/recordings/`) migrated on first run
4. WAV file sent to OpenAI Whisper API with language code (ISO-639-1 first 2 chars)
5. Old recordings cleaned up, keeping only last N files
6. Transcription text and audio path returned to frontend

**Auto-Paste Feature**:
- If enabled, transcription copied to clipboard via `clipboard-manager` plugin
- `paste_text_to_active_window()` simulates Ctrl+V using enigo library
- 50ms delay between clipboard write and paste for reliability

#### Logging System

Located in `logging.rs`:

- Custom `TauriLogLayer` implements tracing subscriber
- All Rust logs (info, warn, error, etc.) emitted as "app-log" events to frontend
- Frontend hooks (`useAppLogs`) can subscribe to display logs in UI
- Log format includes timestamp, level, and message
- Filter: INFO+ for voice_tool crate, WARN+ for dependencies

### Frontend Architecture

Built with React 19, TypeScript, and Tailwind CSS v4.

**Component Structure**:
- `Dashboard` (main orchestrator): Manages recording state, handles Tauri commands, listens for "audio-captured" and "recording-state" events
- `RecordingCard`: Recording controls UI with toggle button and status
- `TranscriptionList`: List of past transcriptions with delete/copy actions
- `TranscriptionDetails`: Detail view sidebar with audio playback
- `MiniWindow`: Standalone mini visualizer with 16 animated bars and recording timer
- `SettingsDialog`: Multi-tab configuration (API keys, hotkeys, audio devices, general settings)
- `LogsTab`: Real-time Rust log viewer in settings dialog

**State Management**:
- React Context for settings (`SettingsContext`) and shared state
- Custom hooks for data persistence and logic:
  - `useSettings`: Settings CRUD via Tauri Store plugin
  - `useTranscriptionHistory`: Transcription history persistence in IndexedDB
  - `useAudioDevices`: Audio device list loading
  - `useSoundEffects`: Start/stop/success sound effects
  - `useAppLogs`: Subscribe to Rust tracing logs

**Tauri Integration**:
- Commands invoked via `@tauri-apps/api/core` invoke()
- Events via `@tauri-apps/api/event` listen()/emit()
- Persistent storage via `@tauri-apps/plugin-store` Store
- Clipboard operations via `@tauri-apps/plugin-clipboard-manager`

### Key Technical Details

**Audio Processing**:
- Sample rate: Uses device native rate (typically 16000, 44100, or 48000 Hz)
- Buffer type: `Vec<i16>`
- RMS calculation for visualization with 50x amplification factor (src-tauri/src/audio.rs:276)
- Multi-channel → mono conversion via averaging (audio.rs:254-259)
- Stream lifecycle managed via stream ID counter to prevent callback interference

**Window Lifecycle**:
- Main window close prevented, hidden instead (lib.rs:832-840)
- Mini window created at startup (`create_mini_window`, lib.rs:732-749), toggled via show()/hide()
- Mini window positioned at bottom-center of current monitor (lib.rs:338-371)
- System tray provides "Afficher" (Show) and "Quitter" (Quit) menu items (French UI)

**Recordings Directory Migration**:
- Legacy path: `%APPDATA%/voice-tool/recordings/`
- New path: `%APPDATA%/com.nolyo.voice-tool/recordings/`
- Automatic migration via rename (fallback to copy) on first run (transcription.rs:38-78)

**Build System**:
- Vite for frontend bundling
- Tauri CLI orchestrates Rust compilation and frontend bundling
- Frontend dev server runs on port 1420
- TypeScript path alias: `@/` → `./src/`

## Important Notes

- The lib crate is named `voice_tool_lib` (with underscore) to avoid Windows-specific naming conflicts (Cargo.toml:18)
- Audio stream is intentionally leaked via `std::mem::forget()` and controlled by `is_recording` flag and stream ID counter
- The mini window must be created at startup for instant display; creating on-demand causes noticeable lag
- Always use `pnpm tauri build` for production builds, not `cargo build` alone
- UI text is primarily in French (menu items, error messages, etc.)
- Autostart feature uses `tauri-plugin-autostart` with `--minimized` flag support
- Settings and transcription history are persisted separately (Store plugin for settings, IndexedDB for transcriptions)
