# Mini Window Active-Profile Avatar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the active profile's avatar (photo or initials) at the left of the mini window's main row, so the user instantly sees which profile is recording.

**Architecture:** A tiny mount-time data hook (`useActiveProfileInfo`) fetches the active profile's name + avatar via the existing Tauri commands; `MiniShell` renders the existing `ProfileAvatar` component with it. No events needed — `switch_profile` reloads every WebView, so mount-time data is always fresh. Spec: `docs/superpowers/specs/2026-07-13-mini-window-avatar-design.md`.

**Tech Stack:** React 19 + TypeScript, Vitest + jsdom + Testing Library (renderHook), react-i18next. No Rust change, no dependency change.

## Global Constraints

- **Branch is stacked on `feat/profile-avatar`** (PR #81): `ProfileAvatar` and `get_profile_avatar` come from it. Do not touch anything from PR #81.
- **Purely local**: no migration, no Edge Function, no sync change, no `capabilities/mini.json` change (the mini window already invokes custom commands).
- **The mini window must NEVER break over an avatar failure** — every invoke wrapped, errors swallowed, component renders nothing until `name` is loaded.
- **Every UI string via react-i18next** in BOTH locales. New key: `mini.activeProfile` = fr `"Profil actif : {{name}}"` / en `"Active profile: {{name}}"`.
- Avatar sizes: layout `compact` → `h-5 w-5 text-[8px]`; `standard`/`extended` → `h-6 w-6 text-[10px]`.
- Shown only in the main row (`status === "idle" || status === "recording"`, streaming included); NOT in the transient status row.
- CHANGELOG: EXTEND the existing "Profile pictures" bullet (same unreleased release) — no new bullet.
- Test baseline on this branch: Vitest **490 tests / 68 files**. Expected after: **493 tests / 69 files** (+3 hook tests).
- Conventional commits in English.

## File Structure

- Create `src/hooks/useActiveProfileInfo.ts` + `src/hooks/useActiveProfileInfo.test.ts` — mount-time fetch, swallow-all error policy.
- Modify `src/components/mini-window/MiniShell.tsx` — render `ProfileAvatar` at the left of the main row.
- Modify `src/locales/fr.json` + `src/locales/en.json` — 1 key in the existing `"mini"` section (fr.json line ~856, after `"liveBadge"` line 868).
- Modify `CHANGELOG.md` — extend the "Profile pictures" bullet (line 19).

---

### Task 1: `useActiveProfileInfo` hook

**Files:**
- Create: `src/hooks/useActiveProfileInfo.ts`
- Test: `src/hooks/useActiveProfileInfo.test.ts`

**Interfaces:**
- Consumes: Tauri commands `get_active_profile` → `string`, `list_profiles` → `{ id, name, createdAt }[]`, `get_profile_avatar({ id })` → `string | null`.
- Produces (used by Task 2): `useActiveProfileInfo(): { name: string | null; avatarUrl: string | null }` — both `null` until loaded or on failure.

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/useActiveProfileInfo.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { useActiveProfileInfo } from "./useActiveProfileInfo";

const DATA_URL = "data:image/png;base64,AAAA";
const PROFILES = [
  { id: "default", name: "Default", createdAt: "" },
  { id: "perso", name: "Perso", createdAt: "" },
];

beforeEach(() => {
  invokeMock.mockReset();
});

describe("useActiveProfileInfo", () => {
  it("loads the active profile name and avatar", async () => {
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "get_active_profile") return "perso";
      if (cmd === "list_profiles") return PROFILES;
      if (cmd === "get_profile_avatar") return DATA_URL;
      return undefined;
    });
    const { result } = renderHook(() => useActiveProfileInfo());
    await waitFor(() => expect(result.current.name).toBe("Perso"));
    expect(result.current.avatarUrl).toBe(DATA_URL);
    expect(invokeMock).toHaveBeenCalledWith("get_profile_avatar", {
      id: "perso",
    });
  });

  it("returns a null avatarUrl for a profile without a photo", async () => {
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "get_active_profile") return "default";
      if (cmd === "list_profiles") return PROFILES;
      if (cmd === "get_profile_avatar") return null;
      return undefined;
    });
    const { result } = renderHook(() => useActiveProfileInfo());
    await waitFor(() => expect(result.current.name).toBe("Default"));
    expect(result.current.avatarUrl).toBeNull();
  });

  it("stays null on invoke failure without throwing", async () => {
    invokeMock.mockRejectedValue(new Error("ipc down"));
    const { result } = renderHook(() => useActiveProfileInfo());
    // Give the effect a tick to settle; nothing must throw or reject unhandled.
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toEqual({ name: null, avatarUrl: null });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/hooks/useActiveProfileInfo.test.ts`
Expected: FAIL (cannot resolve `./useActiveProfileInfo`).

- [ ] **Step 3: Implement**

Create `src/hooks/useActiveProfileInfo.ts`:

```ts
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ProfileMeta {
  id: string;
  name: string;
  createdAt: string;
}

export interface ActiveProfileInfo {
  name: string | null;
  avatarUrl: string | null;
}

/**
 * Loads the active profile's name and avatar once on mount. Errors are
 * swallowed (the mini window must never break over an avatar), and no
 * listener is needed: switching profiles reloads every WebView, so
 * mount-time data is always fresh.
 */
export function useActiveProfileInfo(): ActiveProfileInfo {
  const [info, setInfo] = useState<ActiveProfileInfo>({
    name: null,
    avatarUrl: null,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [id, profiles] = await Promise.all([
          invoke<string>("get_active_profile"),
          invoke<ProfileMeta[]>("list_profiles"),
        ]);
        const name = profiles.find((p) => p.id === id)?.name ?? null;
        const avatarUrl = await invoke<string | null>("get_profile_avatar", {
          id,
        }).catch(() => null);
        if (!cancelled) {
          setInfo({
            name,
            avatarUrl: typeof avatarUrl === "string" ? avatarUrl : null,
          });
        }
      } catch {
        // Swallow — the mini window renders without the avatar.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/hooks/useActiveProfileInfo.test.ts`
Expected: 3 passed, output pristine (no unhandled rejection warnings).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useActiveProfileInfo.ts src/hooks/useActiveProfileInfo.test.ts
git commit -m "feat: useActiveProfileInfo hook (mini window profile identity)"
```

---

### Task 2: MiniShell wiring, i18n, CHANGELOG

**Files:**
- Modify: `src/components/mini-window/MiniShell.tsx`
- Modify: `src/locales/fr.json` (inside `"mini"`, after `"liveBadge": "LIVE"` line ~868 — add a comma to that line)
- Modify: `src/locales/en.json` (same position)
- Modify: `CHANGELOG.md` (line 19)

**Interfaces:**
- Consumes: `useActiveProfileInfo` (Task 1), `ProfileAvatar` (`@/components/dashboard/ProfileAvatar`, from PR #81), existing `layout` from `useMiniWindowSize` and `status` from `useMiniWindowState`.
- Produces: final user-facing feature; no new exports.

- [ ] **Step 1: Wire the avatar into MiniShell**

In `src/components/mini-window/MiniShell.tsx`:

1. Add imports (after the existing hook imports):

```tsx
import { useActiveProfileInfo } from "@/hooks/useActiveProfileInfo";
import { ProfileAvatar } from "@/components/dashboard/ProfileAvatar";
```

2. Inside `MiniShell()`, after `const layout = useMiniWindowSize();`:

```tsx
  const { name: profileName, avatarUrl: profileAvatarUrl } =
    useActiveProfileInfo();
```

3. In the main row (the `{(status === "idle" || status === "recording") && (` block), insert as the FIRST child of the `<div className="flex flex-1 items-center gap-2 min-h-0" data-tauri-drag-region>`, before the streaming/visualizer conditional:

```tsx
            {profileName && (
              <span
                className="flex-shrink-0"
                title={t("mini.activeProfile", { name: profileName })}
                aria-label={t("mini.activeProfile", { name: profileName })}
              >
                <ProfileAvatar
                  avatarUrl={profileAvatarUrl}
                  name={profileName}
                  className={
                    layout === "compact"
                      ? "h-5 w-5 text-[8px]"
                      : "h-6 w-6 text-[10px]"
                  }
                />
              </span>
            )}
```

- [ ] **Step 2: i18n keys**

In `src/locales/fr.json`, inside `"mini"`, after `"liveBadge": "LIVE"` (add a comma to that line):

```json
    "activeProfile": "Profil actif : {{name}}"
```

In `src/locales/en.json`, same position after `"liveBadge": "LIVE"`:

```json
    "activeProfile": "Active profile: {{name}}"
```

- [ ] **Step 3: CHANGELOG**

In `CHANGELOG.md` line 19, extend the existing bullet — replace:

```markdown
- **Profile pictures** — set a local photo per profile from the profile manager (center-cropped and resized to 256×256, stored on this device only, never synced); shown in the profile switcher button and list, with initials as fallback.
```

with:

```markdown
- **Profile pictures** — set a local photo per profile from the profile manager (center-cropped and resized to 256×256, stored on this device only, never synced); shown in the profile switcher button and list, with initials as fallback. The active profile's picture also appears in the mini window, so you can tell at a glance which profile is recording.
```

- [ ] **Step 4: Full verification**

```bash
pnpm vitest run
pnpm build
```
Expected: **493 passed, 69 files**, 0 failures; tsc + Vite build clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/mini-window/MiniShell.tsx src/locales/fr.json src/locales/en.json CHANGELOG.md
git commit -m "feat: show active profile avatar in the mini window"
```

---

## Self-Review Notes

- **Spec coverage:** hook + swallow-all policy (Task 1), left-of-main-row placement idle+recording incl. streaming, layout-dependent sizes, title/aria via `mini.activeProfile` fr+en, no capabilities change, CHANGELOG extension (Task 2). Status row untouched — avatar only renders inside the main-row conditional.
- **Type consistency:** `ActiveProfileInfo { name: string | null; avatarUrl: string | null }` consumed as `profileName`/`profileAvatarUrl`; `ProfileAvatar` props match PR #81's contract (`avatarUrl?: string | null`, `name: string`, `className`).
- **Test math:** 490 + 3 = **493 tests / 69 files** after Task 1 (Task 2 adds none).
- **Drag region note:** Tauri drag regions do NOT inherit — the attribute must be stamped on each element (verified in tauri 2.10.3 drag.js). The avatar span is therefore a small non-drag dead zone, consistent with the neighboring visualizer/header elements which don't stamp it either.
