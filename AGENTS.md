# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Tauri-based desktop voice recording application with real-time audio visualization. The application features:
- Audio capture from system microphones using Rust (cpal library)
- Real-time audio level visualization
- Global keyboard shortcut (Ctrl+F11) for quick recording
- Multi-window architecture with a main dashboard and floating mini visualizer
- System tray integration with hide-to-tray behavior

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
   - Hides to system tray on close (doesn't quit)
   - Standard window decorations

2. **Mini Window** (`mini.html` → `src/mini-window.tsx`)
   - Floating audio visualizer (250x100px)
   - Pre-created at startup but hidden by default
   - Shows/hides on recording toggle
   - Transparent, frameless, always-on-top
   - Receives real-time audio level events from Rust backend

Both windows are defined in Vite's multi-page configuration (`vite.config.ts` rollupOptions.input).

### Rust Backend Architecture

Located in `src-tauri/src/`:

- **`main.rs`**: Entry point, delegates to library
- **`lib.rs`**: Tauri setup, window management, global shortcuts, system tray, and Tauri command handlers
- **`audio.rs`**: Audio recording implementation using cpal

#### Audio Recording Flow

1. **Device Selection**: `get_audio_devices()` lists available input devices via cpal
2. **Recording Start**:
   - `start_recording()` clears buffer, builds audio stream, emits "recording-state" event
   - Stream uses `std::mem::forget()` to keep it alive (intentional leak)
   - Audio callback runs continuously, converting samples to i16, calculating RMS
   - Emits "audio-level" events for real-time visualization
3. **Recording Stop**:
   - Sets `is_recording` flag to false (stops callback)
   - Returns captured i16 samples from buffer

#### Global Shortcut Integration

In `lib.rs:104-142`, the `Ctrl+F11` shortcut:
- Toggles recording state
- Shows/hides the mini window (pre-created, just visibility toggle)
- Emits "recording-state" events to sync UI

### Frontend Architecture

Built with React 19, TypeScript, and Tailwind CSS v4.

**Component Structure**:
- `Dashboard` (main orchestrator): Manages recording state, handles Tauri commands
- `RecordingCard`: Recording controls UI
- `TranscriptionList`: List of past transcriptions (currently sample data)
- `TranscriptionDetails`: Detail view sidebar
- `MiniWindow`: Standalone mini visualizer that listens to "audio-level" and "recording-state" events

**State Management**: Component-level useState (no global state library currently)

**Tauri Integration**:
- Commands invoked via `@tauri-apps/api/core` invoke()
- Events via `@tauri-apps/api/event` listen()/emit()

### Key Technical Details

**Audio Processing**:
- Sample rate: 16000 Hz (standard for speech recognition)
- Buffer type: Vec<i16>
- RMS calculation for visualization with 50x amplification factor (src-tauri/src/audio.rs:188)
- Stereo → mono conversion via channel stepping (audio.rs:179)

**Window Lifecycle**:
- Main window close prevented, hidden instead (lib.rs:184-191)
- Mini window created at startup, toggled via show()/hide() for instant appearance
- System tray provides "Show" and "Quit" menu items

**Build System**:
- Vite for frontend bundling
- Tauri CLI orchestrates Rust compilation
- Frontend dev server runs on port 1420
- TypeScript path alias: `@/` → `./src/`

## Important Notes

- The lib crate is named `voice_tool_lib` (with underscore) to avoid Windows-specific naming conflicts (Cargo.toml:14)
- Audio stream is intentionally leaked via `std::mem::forget()` and controlled by the `is_recording` flag
- The mini window must be created at startup for instant display; creating on-demand causes noticeable lag
- Transcription functionality is stubbed (TODO in dashboard.tsx:47)
