# Cross-Platform Migration Report: Linux (and macOS) Support

**Purpose**: This document is a comprehensive analysis of all platform-specific code in the Voice Tool codebase that must be addressed to support Linux (primary target) and macOS (secondary target). It is intended to be consumed by an LLM for code review, followed by another LLM for implementation.

**Current state**: Windows-only desktop application built with Tauri v2 + React 19 + Rust.

---

## 1. CRITICAL: Hard-Coded Windows Paths and Environment Variables

### 1.1 `APPDATA` environment variable — `src-tauri/src/transcription_local.rs:15-17`

```rust
let app_data = std::env::var("APPDATA")
    .or_else(|_| std::env::var("HOME"))
    .context("Could not find application data directory")?;
```

**Problem**: `APPDATA` is Windows-only. The fallback to `$HOME` is incorrect — it points to the user's home directory, not an application data directory. On Linux it would resolve to `/home/user/` instead of `~/.local/share/com.nolyo.voice-tool/`. This function is used for the **models directory** (where whisper .bin files are stored, potentially hundreds of MB).

**Fix**: Use Tauri's `app.path().app_data_dir()` API (like the rest of the codebase already does) or use the `dirs` crate. Every other module correctly uses `app.path().app_data_dir()`. This function should accept an `AppHandle` parameter and resolve via Tauri paths, OR the models directory should be moved under the profile directory like recordings/notes/transcriptions.

**Severity**: HIGH — Local transcription (whisper-rs) model storage is broken on non-Windows.

### 1.2 Windows-specific path in updater portable detection — `src-tauri/src/updater.rs:42-66`

```rust
let is_installed = exe_dir_str.contains("program files")
    || exe_dir_str.contains("programfiles")
    || exe_dir_str.contains(r"appdata\local\programs");

let has_uninstaller =
    exe_dir.join("unins000.exe").exists() || exe_dir.join("uninstall.exe").exists();
```

**Problem**: These checks are entirely Windows-specific:
- `program files` / `programfiles` directories don't exist on Linux
- `appdata\local\programs` uses Windows backslash paths
- `unins000.exe` / `uninstall.exe` are NSIS uninstaller files (Windows-only)

On Linux, this function will always return `false` (disable updater) because:
- The exe path won't contain "program files"
- No `unins000.exe` exists
- Installed Linux apps typically live in `/usr/bin/`, `/opt/`, or `/usr/lib/`

**Fix**: Add platform-specific detection:
- Linux: Check if running from `/usr/bin/`, `/opt/`, or was installed via `.deb`/`.AppImage`/flatpak
- macOS: Check if running from `/Applications/` (.app bundle)
- Consider always enabling the updater on Linux when installed via AppImage (Tauri supports AppImage updater natively)

**Severity**: HIGH — Auto-updater is completely non-functional on Linux.

### 1.3 Backslash path normalization — `src-tauri/src/commands/transcription.rs:81`

```rust
audio_path: wav_path.to_string_lossy().replace('\\', "/").to_string(),
```

**Problem**: This is a workaround for Windows backslash paths being sent to the frontend. On Linux/macOS, paths already use forward slashes, so this is harmless but unnecessary. The real fix is to use `Path::to_slash()` or just keep this as-is (it's a no-op on Linux).

**Severity**: LOW — Works on Linux as-is (no-op), but should be cleaned up.

---

## 2. CRITICAL: Windows-Specific APIs and Conditional Compilation

### 2.1 Mini window show/hide using Win32 API — `src-tauri/src/window.rs:176-211`

```rust
pub(crate) fn show_mini_window<R: Runtime>(app_handle: &AppHandle<R>) {
    if let Some(mini_window) = app_handle.get_webview_window("mini") {
        position_mini_window(app_handle, &mini_window);

        #[cfg(windows)]
        {
            if let Ok(hwnd) = mini_window.hwnd() {
                const SW_SHOWNOACTIVATE: i32 = 4;
                unsafe {
                    windows_sys::Win32::UI::WindowsAndMessaging::ShowWindow(
                        hwnd.0,
                        SW_SHOWNOACTIVATE,
                    );
                }
                return;
            }
        }

        let _ = mini_window.show();
    }
}
```

Same pattern for `hide_mini_window` using `SW_HIDE`.

**Problem**: The `#[cfg(windows)]` blocks use `windows_sys` crate (Win32 API) to show/hide the mini window without activating it (`SW_SHOWNOACTIVATE`). On the non-Windows path, `mini_window.show()` and `mini_window.hide()` are used as fallbacks. However:
- On Linux, `mini_window.show()` will **steal focus** from the active window because there's no equivalent of `SW_SHOWNOACTIVATE` in the generic path.
- The `hwnd()` method is Windows-only (returns a Windows HWND).

**Fix**: 
- The generic fallback (`mini_window.show()` / `mini_window.hide()`) already exists and will work on Linux.
- For the focus-stealing issue on Linux, investigate Wayland/X11-specific solutions, or use Tauri's `set_focusable(false)` which is already set during window creation.
- The `#[cfg(windows)]` pattern is correct — it will be skipped on Linux automatically.

**Severity**: MEDIUM — Functional on Linux via fallback, but the mini window may steal focus.

### 2.2 `windows_subsystem = "windows"` attribute — `src-tauri/src/main.rs:2`

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
```

**Problem**: None. This attribute is a no-op on non-Windows platforms. It only suppresses the console window on Windows in release builds. On Linux, the terminal output is expected and desirable.

**Severity**: NONE — No change needed.

### 2.3 File explorer opening — `src-tauri/src/commands/files.rs:22-32`

```rust
#[cfg(target_os = "windows")]
{
    std::process::Command::new("explorer")
        .arg(app_data)
        .spawn()
        .map_err(|e| e.to_string())?;
}
#[cfg(not(target_os = "windows"))]
{
    opener::open(app_data).map_err(|e| e.to_string())?;
}
```

**Problem**: The non-Windows path uses the `opener` crate, which is already a dependency via `tauri-plugin-opener`. However, `opener` must be explicitly added as a dependency in `Cargo.toml` if used directly. Currently, it's only implicitly available through the Tauri plugin.

**Fix**: Either:
1. Add `opener` as an explicit dependency in `Cargo.toml`, OR
2. Use `show-item-in-folder` from `tauri-plugin-opener`'s JavaScript API instead, OR
3. Add a `#[cfg(target_os = "linux")]` block using `xdg-open` or the `open` crate

**Severity**: MEDIUM — Compilation will likely fail because `opener` is not a direct dependency.

---

## 3. CRITICAL: Dependency and Build System Changes

### 3.1 `windows-sys` crate — `Cargo.toml:59-60`

```toml
[target.'cfg(target_os = "windows")'.dependencies]
windows-sys = { version = "0.59", features = ["Win32_UI_WindowsAndMessaging"] }
```

**Problem**: None. This is correctly platform-gated with `cfg(target_os = "windows")`. It won't be compiled on Linux.

**Severity**: NONE — Already correct.

### 3.2 `whisper-rs` with CUDA feature — `Cargo.toml:51`

```toml
whisper-rs = { version = "0.14", features = ["cuda"] }
```

**Problem**: The `cuda` feature forces CUDA GPU acceleration. On Linux without an NVIDIA GPU + CUDA toolkit installed, this will either:
1. Fail to compile (missing CUDA libraries)
2. Fail at runtime (no CUDA device)

**Fix**: 
- Make CUDA optional: use a feature flag
- Consider defaulting to CPU-only on Linux, or detecting GPU availability at runtime
- whisper-rs also supports a "coreml" feature for macOS
- Add optional features:
  ```toml
  whisper-rs = { version = "0.14", default-features = false, features = [] }
  # In a [features] section:
  # cuda = ["whisper-rs/cuda"]
  # metal = ["whisper-rs/coreml"]  # macOS
  ```

**Severity**: HIGH — Build will fail on any Linux machine without CUDA toolkit installed.

### 3.3 `cpal` audio library — `Cargo.toml:39`

```toml
cpal = "0.15"
```

**Problem**: `cpal` is cross-platform (uses ALSA/PulseAudio on Linux, CoreAudio on macOS). However:
- On Linux, `cpal` requires ALSA development headers (`libasound2-dev` on Debian/Ubuntu, `alsa-lib-devel` on Fedora)
- PulseAudio support may need additional configuration
- Wayland audio routing may behave differently

**Fix**: Document build prerequisites:
```bash
# Ubuntu/Debian
sudo apt install libasound2-dev

# Fedora
sudo dnf install alsa-lib-devel

# Arch
sudo pacman -S alsa-lib
```

**Severity**: MEDIUM — Cross-platform by design, but requires system dependencies.

### 3.4 `enigo` keyboard simulation — `Cargo.toml:56`

```toml
enigo = "0.2"
```

**Problem**: `enigo` is cross-platform and uses X11/XCB on Linux, CGEvent on macOS. However:
- Linux requires X11 development headers (`libxdo-dev` for xdotool, or XCB libs)
- Wayland support in enigo is **limited** — keyboard simulation may not work on Wayland compositors due to security restrictions
- The Ctrl+V paste simulation (`paste_text_to_active_window`) may behave differently on Linux

**Fix**: 
- Document build prerequisites: `libxdo-dev` (Ubuntu) or `xdotool` + dev packages
- Consider a Wayland-specific code path or warning
- Test that `Key::Control` + `Key::Unicode('v')` produces Ctrl+V on Linux (it should)

**Severity**: MEDIUM — Functional on X11, potentially broken on Wayland.

### 3.5 Tauri plugins compatibility

All Tauri plugins used are cross-platform:
- `tauri-plugin-opener`: Linux/macOS compatible
- `tauri-plugin-store`: Linux/macOS compatible
- `tauri-plugin-clipboard-manager`: Linux/macOS compatible (uses xclip/wl-clipboard on Linux)
- `tauri-plugin-global-shortcut`: Linux/macOS compatible
- `tauri-plugin-autostart`: Linux/macOS compatible (uses XDG autostart on Linux, LaunchAgent on macOS)
- `tauri-plugin-updater`: Linux/macOS compatible (AppImage updater on Linux)
- `tauri-plugin-single-instance`: Linux/macOS compatible
- `tauri-plugin-fs`: Linux/macOS compatible

**Severity**: LOW — All plugins are already cross-platform.

---

## 4. HIGH: Tauri Configuration (`tauri.conf.json`)

### 4.1 Bundle configuration — `src-tauri/tauri.conf.json:33-49`

```json
"bundle": {
    "active": true,
    "targets": "all",
    "createUpdaterArtifacts": true,
    "icon": [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.icns",
        "icons/icon.ico"
    ],
    "windows": {
        "wix": {
            "language": "fr-FR"
        }
    }
}
```

**Problem**: 
- `"targets": "all"` will try to build all platform-specific targets. On Linux this means `.deb`, `.AppImage`, and potentially more.
- The `windows.wix` section is Windows-only and harmless on other platforms.
- The icon list includes `.ico` (Windows) and `.icns` (macOS) — both are fine, Tauri picks the right format per platform.
- Missing Linux-specific bundle configuration (e.g., `.deb` package metadata, AppImage settings).

**Fix**: Add Linux-specific bundle config:
```json
"bundle": {
    "linux": {
        "deb": {
            "depends": ["libasound2", "libwebkit2gtk-4.1-0", "libgtk-3-0"]
        },
        "appimage": {
            "bundleMediaFramework": false
        }
    }
}
```

**Severity**: MEDIUM — Build may succeed with defaults, but proper Linux bundling requires configuration.

### 4.2 Updater configuration — `src-tauri/tauri.conf.json:51-59`

```json
"plugins": {
    "updater": {
        "pubkey": "...",
        "endpoints": [
            "https://github.com/Nolyo/voice-tool/releases/latest/download/latest.json"
        ],
        "windows": {
            "installMode": "passive"
        }
    }
}
```

**Problem**: The `latest.json` generated by `release.ps1` only contains a `"windows-x86_64"` platform entry. For Linux support, the updater manifest must also include `"linux-x86_64"` (and `"darwin-x86_64"` / `"darwin-aarch64"` for macOS).

**Fix**: The `latest.json` generation (in `release.ps1` and GitHub Actions) must be updated to include per-platform entries when cross-platform builds are added.

**Severity**: HIGH — Auto-updater will not work on Linux without platform entries in the manifest.

---

## 5. HIGH: CI/CD Pipeline — `.github/workflows/release.yml`

### 5.1 Windows-only release workflow

The current `release.yml` only generates update manifests. The actual build is done locally via `release.ps1` (PowerShell script, Windows-only). There is no CI build step for any platform.

**Problem**: 
- No Linux build in CI
- No macOS build in CI
- `release.ps1` is a PowerShell script with Windows-specific paths (backslashes, `.exe` extensions, `Get-FileHash`, NSIS/MSI artifacts)
- The `latest.json` generation is Windows-only

**Fix**: Create a cross-platform CI workflow:
```yaml
jobs:
  build:
    strategy:
      matrix:
        include:
          - platform: linux
            os: ubuntu-latest
            target: x86_64-unknown-linux-gnu
          - platform: windows
            os: windows-latest
            target: x86_64-pc-windows-msvc
          - platform: macos
            os: macos-latest
            target: aarch64-apple-darwin
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
      - name: Install Linux dependencies
        if: matrix.platform == 'linux'
        run: |
          sudo apt update
          sudo apt install -y libasound2-dev libwebkit2gtk-4.1-dev libgtk-3-dev
      - name: Build
        run: pnpm tauri build --target ${{ matrix.target }}
      # ... upload artifacts
```

**Severity**: HIGH — No way to produce Linux/macOS builds without CI changes.

### 5.2 Linux system dependencies for Tauri

Tauri v2 on Linux requires these system packages (for the WebView and GTK):
```bash
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

These must be installed in CI and documented for local development.

---

## 6. MEDIUM: Frontend Changes

### 6.1 Hotkey display — `src/components/settings/common/HotkeyInput.tsx:8-9, 27`

```typescript
const isMacPlatform = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

// ...
if (event.metaKey) parts.push(isMacPlatform() ? "Cmd" : "Super");
```

**Problem**: `navigator.platform` is deprecated. On Linux, Meta key is typically labeled "Super" or "Meta". The current code already handles this correctly by using "Super" for non-Mac platforms. However:
- The **default hotkeys** are `Ctrl+F11`, `Ctrl+F12`, `Ctrl+Alt+O` — these use Ctrl which is cross-platform.
- On Linux, `Ctrl` may conflict with system/Wayland shortcuts.
- The `isMacPlatform()` function should be updated to use `navigator.userAgentData?.platform` or `userAgent` as `platform` is deprecated.

**Severity**: LOW — Default hotkeys use Ctrl which works everywhere. Mac detection could be improved.

### 6.2 Path separators in frontend

The only path normalization is in `commands/transcription.rs:81` (Rust side). The frontend receives forward-slash paths from the Rust side. No frontend code directly manipulates file paths.

**Severity**: NONE — No frontend path issues.

---

## 7. MEDIUM: Keyboard Simulation (Paste Feature)

### 7.1 `paste_text_to_active_window` — `src-tauri/src/commands/misc.rs:3-30`

```rust
enigo.key(Key::Control, enigo::Direction::Press)?;
enigo.key(Key::Unicode('v'), enigo::Direction::Click)?;
enigo.key(Key::Control, enigo::Direction::Release)?;
```

**Problem**: This simulates Ctrl+V which works on Windows and Linux (X11). However:
- On **Wayland**, `enigo` may not be able to simulate keyboard events due to security restrictions
- On **macOS**, the keyboard shortcut is Cmd+V, not Ctrl+V

**Fix**: Add platform-specific key modifier:
```rust
#[cfg(target_os = "macos")]
let modifier = Key::Meta;
#[cfg(not(target_os = "macos"))]
let modifier = Key::Control;
```

Also add a Wayland detection/warning or fallback.

**Severity**: MEDIUM — Works on X11 Linux, broken on Wayland, uses wrong modifier on macOS.

### 7.2 `type_text_at_cursor` — `src-tauri/src/commands/misc.rs:35-59`

```rust
enigo.text(&text)?;
```

**Problem**: Direct text input via `enigo` uses XTest on Linux X11. Same Wayland limitation as above. This should work for basic ASCII but may have issues with Unicode/IME input.

**Severity**: LOW — Generally functional, Wayland is the main concern.

---

## 8. MEDIUM: Audio Capture on Linux

### 8.1 `cpal` device enumeration — `src-tauri/src/audio.rs`

**Problem**: `cpal` uses ALSA by default on Linux. This means:
- Only ALSA devices are listed (no PulseAudio sources directly)
- To capture from PulseAudio/PipeWire, users may need to select the PulseAudio ALSA plugin device
- The "default" device on Linux may be ALSA default, not PulseAudio default
- VM audio passthrough typically provides a virtual ALSA device (works but may need configuration)

**Fix**: 
- Consider adding a feature flag or alternative audio backend (e.g., `cpal` with PulseAudio backend)
- Document that users may need `pulseaudio-alsa` plugin for PulseAudio device access
- Test thoroughly in a VM — VM audio passthrough should work with ALSA

**Severity**: MEDIUM — Audio capture works via ALSA, but device discovery may not show PulseAudio/PipeWire sources.

---

## 9. LOW: System Tray

### 9.1 Tray labels — `src-tauri/src/tray.rs`

The tray menu currently shows "Show" and "Quit" (English labels) with a command to update them (`update_tray_labels`). The app appears to have i18n support via the frontend.

**Problem**: Linux desktop environments may render the tray differently:
- GNOME 42+ no longer has a built-in system tray (requires extension)
- KDE Plasma, XFCE, etc. have full tray support
- AppIndicator may be needed (Tauri uses it by default on Linux)

**Severity**: LOW — Tauri handles tray abstraction. GNOME tray limitation is a known ecosystem issue.

---

## 10. Summary: Required Changes for Linux Support

### Phase 1: Build & Compilation

| # | Item | File | Severity | Effort |
|---|------|------|----------|--------|
| 1 | Fix `APPDATA` path in `get_models_dir()` | `transcription_local.rs:14-28` | HIGH | Low |
| 2 | Make `whisper-rs` CUDA feature optional | `Cargo.toml:51` | HIGH | Low |
| 3 | Add `opener` as direct dependency (or use Tauri API) | `Cargo.toml`, `commands/files.rs` | MEDIUM | Low |
| 4 | Add Linux system deps to build docs | `docs/` or `README.md` | MEDIUM | Low |
| 5 | Add Linux bundle config to `tauri.conf.json` | `tauri.conf.json` | MEDIUM | Low |
| 6 | Ensure `libasound2-dev` and GTK/WebKit deps are installed | CI + dev docs | MEDIUM | Medium |

### Phase 2: Runtime Behavior

| # | Item | File | Severity | Effort |
|---|------|------|----------|--------|
| 7 | Fix updater `is_updater_available()` for Linux | `updater.rs:42-66` | HIGH | Medium |
| 8 | Update `latest.json` to include `linux-x86_64` | `release.ps1`, CI | HIGH | Medium |
| 9 | Add platform-aware paste (Ctrl vs Cmd) | `commands/misc.rs` | MEDIUM | Low |
| 10 | Document Wayland limitations for keyboard simulation | `docs/` | MEDIUM | Low |
| 11 | Test mini window show/hide focus behavior on Linux | `window.rs:176-211` | MEDIUM | Low |

### Phase 3: CI/CD

| # | Item | File | Severity | Effort |
|---|------|------|----------|--------|
| 12 | Add Linux build job to GitHub Actions | `.github/workflows/release.yml` | HIGH | High |
| 13 | Create cross-platform `latest.json` generation | CI scripts | HIGH | Medium |
| 14 | Rewrite or augment `release.ps1` for cross-platform releases | `release.ps1` or new script | HIGH | High |

### Phase 4: Polish & Testing

| # | Item | File | Severity | Effort |
|---|------|------|----------|--------|
| 15 | Test audio device enumeration on Linux (ALSA vs PulseAudio) | `audio.rs` | MEDIUM | Medium |
| 16 | Verify autostart works via XDG `.desktop` file | `lib.rs:38-41` | LOW | Low |
| 17 | Test system tray on KDE/GNOME/XFCE | `tray.rs` | LOW | Low |
| 18 | Verify clipboard operations (xclip/wl-clipboard) | Frontend + plugin | LOW | Low |
| 19 | Update CLAUDE.md with Linux development instructions | `CLAUDE.md` | LOW | Low |

---

## 11. Notes for the Implementing LLM

1. **Start with Phase 1** — getting the project to compile on Linux is the first priority. Items 1-3 are blocking compilation issues.

2. **The `#[cfg(windows)]` pattern is already used correctly** in `window.rs` and `files.rs`. Follow this pattern for new platform-specific code.

3. **Tauri v2 abstracts most platform differences** — window management, webview, store, shortcuts, clipboard, autostart, and tray all work cross-platform via plugins. The main issues are in Rust code that directly uses OS APIs.

4. **Wayland is a known challenge** — keyboard simulation and global shortcuts may have limitations. Consider detecting the display server and showing appropriate warnings.

5. **The `transcription_local.rs:get_models_dir()` function** is the biggest architectural inconsistency. Every other module uses `app.path().app_data_dir()` via Tauri, but this function uses raw environment variables. It should be refactored to match the rest of the codebase.

6. **Test in a Ubuntu 22.04/24.04 VM** with X11 (not Wayland) for initial testing. Wayland support can be addressed later.

7. **The `release.ps1` script** is Windows-only (PowerShell). For Linux releases, either create a bash equivalent or move everything to GitHub Actions.
