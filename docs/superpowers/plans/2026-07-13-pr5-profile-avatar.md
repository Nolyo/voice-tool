# PR 5 — Profile Avatar (local) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each local profile can carry a photo (`profiles/<id>/avatar.png`, 256×256), shown in the profile switcher (button + list) and managed (set/remove) from the profiles manage dialog. Purely local — never synced.

**Architecture:** The avatar file's presence is the source of truth (no `ProfileMeta` field, no `profiles.json` change). Rust owns the file I/O behind three thin Tauri commands; all validation lives in pure, unit-tested helpers in `src-tauri/src/profiles.rs`. IPC carries PNG **data-URL strings both ways** (`canvas.toDataURL` output on set, base64-encoded file on get) — deliberate deviation from the spec's `bytes: Vec<u8>` signature: a `Vec<u8>` arg serializes to a JSON number array ~4× larger on the wire, while the front already produces a data-URL natively and `get` returns one anyway. Same stored artifact (binary PNG on disk), simpler and symmetric.

**Tech Stack:** Rust (std::fs + `base64` 0.22 — **already in Cargo.lock as a transitive dep**, adding it as a direct dep compiles nothing new), React 19 + TypeScript, canvas crop/resize in the renderer, Vitest + jsdom + Testing Library, react-i18next.

## Global Constraints

- **No DB migration, no Edge Function, no sync change** — the avatar never leaves the machine; no field is added to `ProfileMeta` / `profiles.json` / any sync payload.
- **The ACCOUNT avatar is untouched** — the email-initials circle at the top of the ProfileSwitcher dropdown (`getAccountInitials`) stays exactly as is.
- **Every UI string goes through react-i18next** (title/aria-label included), added to BOTH `src/locales/fr.json` and `src/locales/en.json`.
- **No new dependency absent from the lockfiles.** `base64 = "0.22"` is allowed only because 0.22.1 is already in `src-tauri/Cargo.lock`. Nothing added to package.json.
- **CHANGELOG.md entry in English**, under `## [Unreleased]` → `### Added`.
- **Conventional commits in English.**
- Avatar validation caps: payload ≤ **1 MB** decoded, must start with the **8-byte PNG magic** `89 50 4E 47 0D 0A 1A 0A`, data-URL prefix must be exactly `data:image/png;base64,`.
- Canvas output size: **256×256** (`AVATAR_SIZE`), file name **`avatar.png`** inside `profiles/<id>/`.
- Test baselines before this PR: Vitest **477 tests / 65 files**; Rust `profiles::tests` **4 tests**; Deno sync-push 42 (untouched).
- Expected after: Vitest **489 tests / 68 files** (+5 avatar util, +4 ProfileAvatar, +3 ProfilesContext); Rust `profiles::tests` **11 tests** (+7).
- Rust test command (Bash tool, from `src-tauri/`):
  `export PATH="$PATH:/c/Program Files/CMake/bin"; LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo test --lib profiles::`
  (fallback `--no-default-features` if cmake/MAX_PATH errors).

## File Structure

- Modify `src-tauri/Cargo.toml` — add `base64 = "0.22"`.
- Modify `src-tauri/src/profiles.rs` — pure avatar helpers + `profile_exists` + 7 tests.
- Modify `src-tauri/src/commands/profiles.rs` — 3 thin commands (`set_profile_avatar`, `get_profile_avatar`, `clear_profile_avatar`).
- Modify `src-tauri/src/lib.rs` — register the 3 commands (after `commands::profiles::switch_profile`, line ~175).
- Create `src/lib/avatar.ts` + `src/lib/avatar.test.ts` — pure `centeredSquareCrop` + canvas `fileToAvatarDataUrl`.
- Create `src/components/dashboard/ProfileAvatar.tsx` + `.test.tsx` — presentational avatar (img or initials), hosts `getInitials`.
- Modify `src/contexts/ProfilesContext.tsx` + create `src/contexts/ProfilesContext.avatars.test.tsx` — `avatars` record + `setProfileAvatar`/`clearProfileAvatar`.
- Modify `src/components/dashboard/ProfileSwitcher.tsx` — use `ProfileAvatar` (28 px button, 24 px list), drop local `getInitials`.
- Modify `src/components/dashboard/ProfilesManageDialog.tsx` — 24 px thumbnail + change/remove photo actions + hidden file input.
- Modify `src/locales/fr.json`, `src/locales/en.json` — 3 keys under `profile`.
- Modify `CHANGELOG.md` — one `### Added` bullet.

---

### Task 1: Rust backend — avatar helpers, commands, registration

**Files:**
- Modify: `src-tauri/Cargo.toml` (dependencies section)
- Modify: `src-tauri/src/profiles.rs` (helpers before `// --- ID / name helpers ---`; tests inside the existing `mod tests`)
- Modify: `src-tauri/src/commands/profiles.rs` (append 3 commands)
- Modify: `src-tauri/src/lib.rs` (register commands after `commands::profiles::switch_profile,` ~line 175)

**Interfaces:**
- Consumes: existing `load_manifest`, `get_profile_dir`, `ProfilesManifest`, `ProfileMeta`.
- Produces (used by Task 4 via `invoke`):
  - `set_profile_avatar(id: String, data_url: String) -> Result<(), String>` — JS args `{ id, dataUrl }` (Tauri v2 camelCase mapping)
  - `get_profile_avatar(id: String) -> Result<Option<String>, String>` — returns full `data:image/png;base64,...` or `null`
  - `clear_profile_avatar(id: String) -> Result<(), String>`

- [ ] **Step 1: Add the base64 dependency**

In `src-tauri/Cargo.toml`, `[dependencies]`, after the `chrono = "0.4"` line:

```toml
base64 = "0.22"
```

- [ ] **Step 2: Write the failing tests**

Append inside the existing `mod tests` in `src-tauri/src/profiles.rs` (note: the module already imports `std::fs`):

```rust
    use super::{
        clear_avatar_in, decode_avatar_data_url, profile_exists, read_avatar_data_url_in,
        write_avatar_in, ProfileMeta, ProfilesManifest, AVATAR_DATA_URL_PREFIX, PNG_MAGIC,
    };

    /// Minimal valid payload: PNG magic followed by arbitrary bytes.
    fn fake_png() -> Vec<u8> {
        let mut v = PNG_MAGIC.to_vec();
        v.extend_from_slice(b"not-a-real-png-but-magic-is-enough");
        v
    }

    fn to_data_url(bytes: &[u8]) -> String {
        use base64::Engine as _;
        format!(
            "{}{}",
            AVATAR_DATA_URL_PREFIX,
            base64::engine::general_purpose::STANDARD.encode(bytes)
        )
    }

    #[test]
    fn decode_avatar_data_url_roundtrips_png_bytes() {
        let bytes = fake_png();
        let decoded = decode_avatar_data_url(&to_data_url(&bytes)).unwrap();
        assert_eq!(decoded, bytes);
    }

    #[test]
    fn decode_avatar_rejects_wrong_prefix() {
        let err = decode_avatar_data_url("data:image/jpeg;base64,AAAA").unwrap_err();
        assert!(err.contains("PNG data-URL"), "unexpected error: {err}");
    }

    #[test]
    fn decode_avatar_rejects_invalid_base64() {
        let url = format!("{}%%%not-base64%%%", AVATAR_DATA_URL_PREFIX);
        assert!(decode_avatar_data_url(&url).is_err());
    }

    #[test]
    fn decode_avatar_rejects_non_png_payload() {
        assert!(decode_avatar_data_url(&to_data_url(b"hello world")).is_err());
    }

    #[test]
    fn decode_avatar_rejects_oversized_payload() {
        let mut big = PNG_MAGIC.to_vec();
        big.resize(super::AVATAR_MAX_BYTES + 1, 0u8);
        let err = decode_avatar_data_url(&to_data_url(&big)).unwrap_err();
        assert!(err.contains("too large"), "unexpected error: {err}");
    }

    #[test]
    fn avatar_write_read_clear_roundtrip() {
        let dir = std::env::temp_dir().join(format!("lexena_avatar_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);

        // Missing file -> None
        assert!(read_avatar_data_url_in(&dir).is_none());

        let bytes = fake_png();
        write_avatar_in(&dir, &bytes).unwrap();
        let url = read_avatar_data_url_in(&dir).expect("avatar should exist");
        assert!(url.starts_with(AVATAR_DATA_URL_PREFIX));
        assert_eq!(decode_avatar_data_url(&url).unwrap(), bytes);

        clear_avatar_in(&dir).unwrap();
        assert!(read_avatar_data_url_in(&dir).is_none());
        // Idempotent
        clear_avatar_in(&dir).unwrap();

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn profile_exists_checks_manifest_ids() {
        let manifest = ProfilesManifest {
            active: "default".to_string(),
            profiles: vec![ProfileMeta {
                id: "default".to_string(),
                name: "Default".to_string(),
                created_at: "2026-01-01T00:00:00Z".to_string(),
            }],
        };
        assert!(profile_exists(&manifest, "default"));
        assert!(!profile_exists(&manifest, "ghost"));
    }
```

- [ ] **Step 3: Run tests to verify they fail**

Bash, from `src-tauri/`:
```bash
export PATH="$PATH:/c/Program Files/CMake/bin"
LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo test --lib profiles::
```
Expected: COMPILE ERROR (unresolved imports `decode_avatar_data_url`, etc.).

- [ ] **Step 4: Implement the helpers**

In `src-tauri/src/profiles.rs`, insert just above `// --- ID / name helpers ---`:

```rust
// --- Profile avatar (local photo) ---
//
// The avatar is `profiles/<id>/avatar.png` (256×256, produced by the frontend
// canvas). File presence is the source of truth — no ProfileMeta field.
// IPC carries PNG data-URLs both ways.

pub const AVATAR_FILENAME: &str = "avatar.png";
pub const AVATAR_DATA_URL_PREFIX: &str = "data:image/png;base64,";
/// Decoded payload cap. A 256×256 PNG is ~30-80 KB; 1 MB is a generous guard
/// against arbitrary renderer payloads landing on disk.
pub const AVATAR_MAX_BYTES: usize = 1024 * 1024;
pub const PNG_MAGIC: [u8; 8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

pub fn profile_exists(manifest: &ProfilesManifest, id: &str) -> bool {
    manifest.profiles.iter().any(|p| p.id == id)
}

/// Decode and validate an avatar data-URL. Pure (testable).
pub fn decode_avatar_data_url(data_url: &str) -> Result<Vec<u8>, String> {
    use base64::Engine as _;

    let b64 = data_url
        .strip_prefix(AVATAR_DATA_URL_PREFIX)
        .ok_or_else(|| "Avatar must be a PNG data-URL.".to_string())?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("Invalid base64 avatar payload: {}", e))?;
    if bytes.len() > AVATAR_MAX_BYTES {
        return Err("Avatar image is too large (max 1 MB).".to_string());
    }
    if bytes.len() < PNG_MAGIC.len() || bytes[..PNG_MAGIC.len()] != PNG_MAGIC {
        return Err("Avatar payload is not a PNG image.".to_string());
    }
    Ok(bytes)
}

pub fn write_avatar_in(profile_dir: &std::path::Path, bytes: &[u8]) -> Result<(), String> {
    fs::create_dir_all(profile_dir)
        .map_err(|e| format!("Failed to create profile directory: {}", e))?;
    fs::write(profile_dir.join(AVATAR_FILENAME), bytes)
        .map_err(|e| format!("Failed to write avatar: {}", e))
}

pub fn read_avatar_data_url_in(profile_dir: &std::path::Path) -> Option<String> {
    use base64::Engine as _;

    let bytes = fs::read(profile_dir.join(AVATAR_FILENAME)).ok()?;
    Some(format!(
        "{}{}",
        AVATAR_DATA_URL_PREFIX,
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

pub fn clear_avatar_in(profile_dir: &std::path::Path) -> Result<(), String> {
    let path = profile_dir.join(AVATAR_FILENAME);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Failed to remove avatar: {}", e))?;
    }
    Ok(())
}
```

- [ ] **Step 5: Run tests to verify they pass**

Same command as Step 3. Expected: **11 passed** (`profiles::tests`, 4 pre-existing + 7 new).

- [ ] **Step 6: Add the Tauri commands**

Append to `src-tauri/src/commands/profiles.rs`:

```rust
/// Set a profile's avatar from a PNG data-URL (validates profile + payload)
#[tauri::command]
pub fn set_profile_avatar(app: AppHandle, id: String, data_url: String) -> Result<(), String> {
    let manifest = load_manifest(&app).map_err(|e| e.to_string())?;
    if !crate::profiles::profile_exists(&manifest, &id) {
        return Err(format!("Profile '{}' not found.", id));
    }
    let bytes = crate::profiles::decode_avatar_data_url(&data_url)?;
    let dir = get_profile_dir(&app, &id).map_err(|e| e.to_string())?;
    crate::profiles::write_avatar_in(&dir, &bytes)?;
    tracing::info!("Set avatar for profile: {}", id);
    Ok(())
}

/// Get a profile's avatar as a PNG data-URL, or None if absent
#[tauri::command]
pub fn get_profile_avatar(app: AppHandle, id: String) -> Result<Option<String>, String> {
    let manifest = load_manifest(&app).map_err(|e| e.to_string())?;
    if !crate::profiles::profile_exists(&manifest, &id) {
        return Err(format!("Profile '{}' not found.", id));
    }
    let dir = get_profile_dir(&app, &id).map_err(|e| e.to_string())?;
    Ok(crate::profiles::read_avatar_data_url_in(&dir))
}

/// Remove a profile's avatar (no-op if absent)
#[tauri::command]
pub fn clear_profile_avatar(app: AppHandle, id: String) -> Result<(), String> {
    let manifest = load_manifest(&app).map_err(|e| e.to_string())?;
    if !crate::profiles::profile_exists(&manifest, &id) {
        return Err(format!("Profile '{}' not found.", id));
    }
    let dir = get_profile_dir(&app, &id).map_err(|e| e.to_string())?;
    crate::profiles::clear_avatar_in(&dir)?;
    tracing::info!("Cleared avatar for profile: {}", id);
    Ok(())
}
```

- [ ] **Step 7: Register the commands**

In `src-tauri/src/lib.rs`, after `commands::profiles::switch_profile,` (~line 175):

```rust
            commands::profiles::set_profile_avatar,
            commands::profiles::get_profile_avatar,
            commands::profiles::clear_profile_avatar,
```

- [ ] **Step 8: Full check + re-run tests**

```bash
export PATH="$PATH:/c/Program Files/CMake/bin"
LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo check
LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo test --lib profiles::
```
Expected: check clean, 11 passed.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/profiles.rs src-tauri/src/commands/profiles.rs src-tauri/src/lib.rs
git commit -m "feat: profile avatar backend (set/get/clear commands + PNG validation)"
```

---

### Task 2: Frontend crop utility — `src/lib/avatar.ts`

**Files:**
- Create: `src/lib/avatar.ts`
- Test: `src/lib/avatar.test.ts`

**Interfaces:**
- Produces (used by Task 5): `fileToAvatarDataUrl(file: File): Promise<string>` — resolves to a 256×256 PNG data-URL; rejects on unreadable/invalid image.
- Produces (tested here): `centeredSquareCrop(width: number, height: number): { sx: number; sy: number; size: number }`, `AVATAR_SIZE = 256`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/avatar.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { centeredSquareCrop, AVATAR_SIZE } from "./avatar";

describe("centeredSquareCrop", () => {
  it("crops a landscape image horizontally", () => {
    expect(centeredSquareCrop(400, 300)).toEqual({ sx: 50, sy: 0, size: 300 });
  });

  it("crops a portrait image vertically", () => {
    expect(centeredSquareCrop(300, 500)).toEqual({ sx: 0, sy: 100, size: 300 });
  });

  it("keeps a square image untouched", () => {
    expect(centeredSquareCrop(256, 256)).toEqual({ sx: 0, sy: 0, size: 256 });
  });

  it("floors the offset for odd remainders", () => {
    expect(centeredSquareCrop(401, 300)).toEqual({ sx: 50, sy: 0, size: 300 });
  });
});

describe("AVATAR_SIZE", () => {
  it("is 256", () => {
    expect(AVATAR_SIZE).toBe(256);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/avatar.test.ts`
Expected: FAIL (cannot resolve `./avatar`).

- [ ] **Step 3: Implement**

Create `src/lib/avatar.ts`:

```ts
/** Output size of profile avatars (px). Mirrors the Rust-side expectations. */
export const AVATAR_SIZE = 256;

export interface CropRect {
  sx: number;
  sy: number;
  size: number;
}

/** Largest centered square inside a width×height image. Pure. */
export function centeredSquareCrop(width: number, height: number): CropRect {
  const size = Math.min(width, height);
  return {
    sx: Math.floor((width - size) / 2),
    sy: Math.floor((height - size) / 2),
    size,
  };
}

/**
 * Read an image file, center-crop it to a square and resize to
 * AVATAR_SIZE×AVATAR_SIZE, returning a PNG data-URL ready for
 * the `set_profile_avatar` command.
 */
export function fileToAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { sx, sy, size } = centeredSquareCrop(
        img.naturalWidth,
        img.naturalHeight
      );
      const canvas = document.createElement("canvas");
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image file"));
    };
    img.src = url;
  });
}
```

(`fileToAvatarDataUrl` needs a real canvas — not unit-testable under jsdom; covered by the manual smoke test, as the spec allows.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/avatar.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/avatar.ts src/lib/avatar.test.ts
git commit -m "feat: avatar crop utility (centered square crop + 256px PNG data-URL)"
```

---

### Task 3: `ProfileAvatar` presentational component

**Files:**
- Create: `src/components/dashboard/ProfileAvatar.tsx`
- Test: `src/components/dashboard/ProfileAvatar.test.tsx`

**Interfaces:**
- Produces (used by Task 5): `ProfileAvatar({ avatarUrl?: string | null, name: string, className?: string })` — `className` carries sizing + font-size (e.g. `"w-7 h-7 text-[11px]"`); the component owns shape/ring/colors. Also exports `getInitials(name: string): string` (moved verbatim from `ProfileSwitcher.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `src/components/dashboard/ProfileAvatar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ProfileAvatar, getInitials } from "./ProfileAvatar";

afterEach(() => cleanup());

const DATA_URL = "data:image/png;base64,AAAA";

describe("getInitials", () => {
  it("takes the first letter of the first two words", () => {
    expect(getInitials("Jean Dupont")).toBe("JD");
  });

  it("uses a single uppercase letter for one-word names", () => {
    expect(getInitials("nolyo")).toBe("N");
  });
});

describe("ProfileAvatar", () => {
  it("renders the image when an avatar URL is provided", () => {
    const { container } = render(
      <ProfileAvatar avatarUrl={DATA_URL} name="Jean Dupont" className="w-7 h-7" />
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", DATA_URL);
    expect(screen.queryByText("JD")).not.toBeInTheDocument();
  });

  it("falls back to initials without an avatar URL", () => {
    const { container } = render(
      <ProfileAvatar name="Jean Dupont" className="w-7 h-7" />
    );
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("JD")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/components/dashboard/ProfileAvatar.test.tsx`
Expected: FAIL (cannot resolve `./ProfileAvatar`).

- [ ] **Step 3: Implement**

Create `src/components/dashboard/ProfileAvatar.tsx`:

```tsx
/** Initials shown when a profile has no photo. Moved from ProfileSwitcher. */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface ProfileAvatarProps {
  /** PNG data-URL from `get_profile_avatar`; falsy = initials fallback. */
  avatarUrl?: string | null;
  name: string;
  /** Sizing + font-size classes, e.g. "w-7 h-7 text-[11px]". */
  className?: string;
}

export function ProfileAvatar({
  avatarUrl,
  name,
  className = "",
}: ProfileAvatarProps) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        aria-hidden="true"
        className={`rounded-md object-cover ring-1 ring-primary/30 shrink-0 ${className}`}
      />
    );
  }
  return (
    <div
      className={`rounded-md bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center font-semibold text-primary shrink-0 ${className}`}
    >
      {getInitials(name)}
    </div>
  );
}
```

(The `img` is decorative — the parent button/row always carries the profile name as text, hence `alt=""` + `aria-hidden`, no i18n string needed.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/components/dashboard/ProfileAvatar.test.tsx`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/ProfileAvatar.tsx src/components/dashboard/ProfileAvatar.test.tsx
git commit -m "feat: ProfileAvatar component (photo or initials fallback)"
```

---

### Task 4: Extend `ProfilesContext` with avatar state

**Files:**
- Modify: `src/contexts/ProfilesContext.tsx`
- Test: `src/contexts/ProfilesContext.avatars.test.tsx`

**Interfaces:**
- Consumes: Task 1 commands via `invoke` (`get_profile_avatar` → `string | null`, `set_profile_avatar` args `{ id, dataUrl }`, `clear_profile_avatar` args `{ id }`).
- Produces (used by Task 5): context additions
  - `avatars: Record<string, string>` — profile id → data-URL; **no entry = no avatar**
  - `setProfileAvatar(id: string, dataUrl: string): Promise<void>`
  - `clearProfileAvatar(id: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `src/contexts/ProfilesContext.avatars.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { ProfilesProvider, useProfiles } from "./ProfilesContext";

const DATA_URL = "data:image/png;base64,AAAA";
const NEW_URL = "data:image/png;base64,BBBB";

function mockBackend() {
  invokeMock.mockImplementation(async (cmd: unknown, args?: unknown) => {
    if (cmd === "list_profiles")
      return [
        { id: "default", name: "Default", createdAt: "" },
        { id: "work", name: "Work", createdAt: "" },
      ];
    if (cmd === "get_active_profile") return "default";
    if (cmd === "get_profile_avatar")
      return (args as { id: string }).id === "default" ? DATA_URL : null;
    return undefined;
  });
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <ProfilesProvider>{children}</ProfilesProvider>
);

beforeEach(() => {
  invokeMock.mockReset();
  mockBackend();
});

describe("ProfilesContext avatars", () => {
  it("loads avatars on mount, skipping profiles without one", async () => {
    const { result } = renderHook(() => useProfiles(), { wrapper });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.avatars).toEqual({ default: DATA_URL });
  });

  it("setProfileAvatar invokes the command and stores the data-URL", async () => {
    const { result } = renderHook(() => useProfiles(), { wrapper });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    await act(() => result.current.setProfileAvatar("work", NEW_URL));

    expect(invokeMock).toHaveBeenCalledWith("set_profile_avatar", {
      id: "work",
      dataUrl: NEW_URL,
    });
    expect(result.current.avatars.work).toBe(NEW_URL);
  });

  it("clearProfileAvatar invokes the command and drops the entry", async () => {
    const { result } = renderHook(() => useProfiles(), { wrapper });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    await act(() => result.current.clearProfileAvatar("default"));

    expect(invokeMock).toHaveBeenCalledWith("clear_profile_avatar", {
      id: "default",
    });
    expect(result.current.avatars).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/contexts/ProfilesContext.avatars.test.tsx`
Expected: FAIL (`avatars`/`setProfileAvatar` missing from context type).

- [ ] **Step 3: Implement**

In `src/contexts/ProfilesContext.tsx`:

1. Extend the context type:

```ts
interface ProfilesContextType {
  profiles: ProfileMeta[];
  activeProfileId: string;
  isLoaded: boolean;
  /** Profile id -> PNG data-URL. No entry = no avatar. */
  avatars: Record<string, string>;
  createProfile: (name: string) => Promise<ProfileMeta>;
  renameProfile: (id: string, newName: string) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  switchProfile: (id: string) => Promise<void>;
  setProfileAvatar: (id: string, dataUrl: string) => Promise<void>;
  clearProfileAvatar: (id: string) => Promise<void>;
}
```

2. In `ProfilesProvider`, add state and extend `load()` (avatar failures must never block profile loading):

```ts
const [avatars, setAvatars] = useState<Record<string, string>>({});
```

```ts
useEffect(() => {
  async function load() {
    try {
      const [list, active] = await Promise.all([
        invoke<ProfileMeta[]>("list_profiles"),
        invoke<string>("get_active_profile"),
      ]);
      setProfiles(list);
      setActiveProfileId(active);

      const entries = await Promise.all(
        list.map(async (p) => {
          const url = await invoke<string | null>("get_profile_avatar", {
            id: p.id,
          }).catch(() => null);
          return [p.id, url] as const;
        })
      );
      const map: Record<string, string> = {};
      for (const [id, url] of entries) {
        if (typeof url === "string") map[id] = url;
      }
      setAvatars(map);
    } catch (err) {
      console.error("Failed to load profiles:", err);
    } finally {
      setIsLoaded(true);
    }
  }
  load();
}, []);
```

3. Add the two actions and purge on delete:

```ts
const setProfileAvatar = useCallback(
  async (id: string, dataUrl: string): Promise<void> => {
    await invoke("set_profile_avatar", { id, dataUrl });
    setAvatars((prev) => ({ ...prev, [id]: dataUrl }));
  },
  []
);

const clearProfileAvatar = useCallback(async (id: string): Promise<void> => {
  await invoke("clear_profile_avatar", { id });
  setAvatars((prev) => {
    const next = { ...prev };
    delete next[id];
    return next;
  });
}, []);
```

In the existing `deleteProfile` callback, after `setProfiles(...)`:

```ts
setAvatars((prev) => {
  const next = { ...prev };
  delete next[id];
  return next;
});
```

4. Add `avatars`, `setProfileAvatar`, `clearProfileAvatar` to the provider `value`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/contexts/ProfilesContext.avatars.test.tsx`
Expected: 3 passed.

- [ ] **Step 5: Guard against regressions in suites that mock invoke**

Run: `pnpm vitest run`
Expected: 489 passed (477 + 12 new), 68 files, 0 failures. (`SyncContext.activation.test.tsx` mocks return `undefined` for `get_profile_avatar` — handled by the `typeof url === "string"` filter.)

- [ ] **Step 6: Commit**

```bash
git add src/contexts/ProfilesContext.tsx src/contexts/ProfilesContext.avatars.test.tsx
git commit -m "feat: thread profile avatars through ProfilesContext"
```

---

### Task 5: UI wiring — ProfileSwitcher, ProfilesManageDialog, i18n, CHANGELOG

**Files:**
- Modify: `src/components/dashboard/ProfileSwitcher.tsx`
- Modify: `src/components/dashboard/ProfilesManageDialog.tsx`
- Modify: `src/locales/fr.json` (profile section, after `"activeProfileLabel"`)
- Modify: `src/locales/en.json` (same location)
- Modify: `CHANGELOG.md` (`## [Unreleased]` → `### Added`)

**Interfaces:**
- Consumes: `ProfileAvatar` + `getInitials` (Task 3), `fileToAvatarDataUrl` (Task 2), context `avatars`/`setProfileAvatar`/`clearProfileAvatar` (Task 4).
- Produces: final user-facing feature; no new exports.

- [ ] **Step 1: ProfileSwitcher — swap initials blocks for ProfileAvatar**

In `src/components/dashboard/ProfileSwitcher.tsx`:

1. Add import: `import { ProfileAvatar } from "./ProfileAvatar";`
2. Destructure `avatars` from `useProfiles()` (alongside `profiles, activeProfileId, ...`).
3. **Delete** the local `getInitials` function (lines 87-94). **Keep `getAccountInitials` untouched** (account circle is out of scope).
4. Replace the main button avatar block (lines 201-204):

```tsx
          {/* Avatar */}
          <ProfileAvatar
            avatarUrl={activeProfile ? avatars[activeProfile.id] : undefined}
            name={activeProfile?.name ?? "?"}
            className="w-7 h-7 text-[11px]"
          />
```

(`getInitials("?")` renders `"?"` — same fallback as before.)

5. Replace the profile-list avatar block (lines 303-305):

```tsx
                  <ProfileAvatar
                    avatarUrl={avatars[profile.id]}
                    name={profile.name}
                    className="w-6 h-6 text-[10px]"
                  />
```

- [ ] **Step 2: ProfilesManageDialog — thumbnail + change/remove photo**

In `src/components/dashboard/ProfilesManageDialog.tsx`:

1. Imports:
   - extend lucide import: `import { Check, ImageMinus, ImagePlus, Pencil, Trash2, X } from "lucide-react";`
   - add: `import { fileToAvatarDataUrl } from "@/lib/avatar";`
   - add: `import { ProfileAvatar } from "./ProfileAvatar";`
2. Destructure from `useProfiles()`: `avatars, setProfileAvatar, clearProfileAvatar` (alongside the existing ones).
3. Add refs + handlers after the existing state declarations:

```tsx
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const avatarTargetIdRef = useRef<string | null>(null);

  function pickAvatar(id: string) {
    avatarTargetIdRef.current = id;
    avatarInputRef.current?.click();
  }

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const id = avatarTargetIdRef.current;
    e.target.value = "";
    if (!file || !id) return;
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      await setProfileAvatar(id, dataUrl);
    } catch (err) {
      toast.error(t("profile.errorAvatar") + ": " + String(err));
    }
  }

  async function handleAvatarRemove(id: string) {
    try {
      await clearProfileAvatar(id);
    } catch (err) {
      toast.error(t("profile.errorAvatar") + ": " + String(err));
    }
  }
```

(`React.ChangeEvent` needs `import type { ChangeEvent } from "react";` — use `ChangeEvent<HTMLInputElement>` and extend the existing react import instead of the `React.` namespace, matching file style.)

4. In the **view branch** of the profile row (the `<div className="flex items-center justify-between gap-2">` block), add the thumbnail before the name and the two photo buttons before the Pencil button:

```tsx
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <ProfileAvatar
                      avatarUrl={avatars[profile.id]}
                      name={profile.name}
                      className="w-6 h-6 text-[10px]"
                    />
                    <span className="truncate font-medium">{profile.name}</span>
                    {profile.id === activeProfileId && (
                      <span className="text-xs text-primary shrink-0">
                        ({t("profile.active")})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => pickAvatar(profile.id)}
                      className="text-muted-foreground hover:text-foreground cursor-pointer p-1 rounded"
                      title={t("profile.avatarChange")}
                    >
                      <ImagePlus className="w-3.5 h-3.5" />
                    </button>
                    {avatars[profile.id] && (
                      <button
                        onClick={() => handleAvatarRemove(profile.id)}
                        className="text-muted-foreground hover:text-foreground cursor-pointer p-1 rounded"
                        title={t("profile.avatarRemove")}
                      >
                        <ImageMinus className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => startEdit(profile)}
                      className="text-muted-foreground hover:text-foreground cursor-pointer p-1 rounded"
                      title={t("profile.rename")}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {profile.id !== activeProfileId && profiles.length > 1 && (
                      <button
                        onClick={() => startDelete(profile.id)}
                        className="text-muted-foreground hover:text-destructive cursor-pointer p-1 rounded"
                        title={t("common.delete")}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
```

5. Add the hidden file input just before the closing outer `</div>` of the modal (after the footer):

```tsx
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarFile}
        />
```

- [ ] **Step 3: i18n keys**

In `src/locales/fr.json`, inside `"profile"`, after `"activeProfileLabel": "Profil actif"` (add a comma to that line):

```json
    "avatarChange": "Changer la photo",
    "avatarRemove": "Retirer la photo",
    "errorAvatar": "Impossible de mettre à jour la photo"
```

In `src/locales/en.json`, same position after `"activeProfileLabel": "Active profile"`:

```json
    "avatarChange": "Change photo",
    "avatarRemove": "Remove photo",
    "errorAvatar": "Failed to update photo"
```

- [ ] **Step 4: CHANGELOG entry**

In `CHANGELOG.md`, under `## [Unreleased]` → `### Added`, after the "Folder emojis" bullet:

```markdown
- **Profile pictures** — set a local photo per profile from the profile manager (center-cropped and resized to 256×256, stored on this device only, never synced); shown in the profile switcher button and list, with initials as fallback.
```

- [ ] **Step 5: Full verification**

```bash
pnpm vitest run
pnpm build
```
Expected: **489 passed, 68 files**, 0 failures; tsc + Vite build clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/ProfileSwitcher.tsx src/components/dashboard/ProfilesManageDialog.tsx src/locales/fr.json src/locales/en.json CHANGELOG.md
git commit -m "feat: profile avatar UI in switcher and manage dialog"
```

---

## Self-Review Notes

- **Spec coverage:** storage path + presence-as-truth (Task 1), Rust set/get/clear + unknown-profile error on all three commands (Task 1), canvas crop pipeline (Task 2), switcher 28 px button + 24 px list with `getInitials` fallback (Tasks 3+5), manage dialog change/remove (Task 5), account avatar untouched (explicit constraint), i18n fr+en (Task 5), Rust tests + pure-utility Vitest (Tasks 1-4). Deletion cleanup is the existing `delete_profile` `remove_dir_all` — nothing to do.
- **Spec deviation (documented):** IPC uses data-URL strings instead of `Vec<u8>` — see Architecture. Storage artifact and command names match the spec.
- **Type consistency:** `avatars: Record<string, string>` everywhere; `dataUrl` camelCase in every `invoke` (maps to Rust `data_url`); `CropRect { sx, sy, size }` used only inside Task 2.
- **Test math:** avatar.test.ts has 5 `it` blocks (4 crop + 1 AVATAR_SIZE), ProfileAvatar 4, context 3 → 477+12 = **489 tests / 68 files**, reached at Task 4 Step 5 (Task 5 adds no tests).
