# PR #44 Managed Transcription — Second-Review Blocking Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three blocking issues raised in the second-pass review of PR #44 (managed transcription) before tagging v3.0 stable. Non-blocking polish items from the same review are deferred to follow-up tasks.

**Architecture:** Three independent fixes, no shared state:
1. **B1 — Dedupe cloud error notifications.** The cloud transcription path toasts a localized error and re-throws; the outer catch then fires a blocking `alert()` containing the raw `CloudApiError` stringification. Users see two notifications. Fix: outer catch skips the alert when the error is already a (handled) `CloudApiError`, and the cloud branch toasts a generic fallback for unknown statuses so the user always sees one and only one message.
2. **B2 — Add `bad_request` error code (HTTP 400) to the Worker.** Five client-input validation errors currently map to `errorResponse("internal", ...)` → HTTP 500. This skews error-rate dashboards and is wrong on the wire. Add a `bad_request` code and reroute the validation paths to it.
3. **B3 — Harden `isValidTask` against `Object.prototype` pollution.** `task in TEMPLATES` walks the prototype chain, so `"toString"`, `"constructor"`, etc. all narrow to `PostProcessTask`. The handler then crashes with HTTP 500 when it dereferences `template.buildUser` on `Object.prototype.toString`. Replace with a typed `Set<PostProcessTask>` lookup.

**Tech Stack:** TypeScript (Cloudflare Workers + React), vitest, react-i18next, Tauri.

---

## File Structure

**Create:**
- `workers/transcription-api/src/prompts.test.ts` — unit tests for `isValidTask` covering happy path + prototype pollution

**Modify:**
- `workers/transcription-api/src/errors.ts` — add `bad_request` to the `ErrorCode` union and to `STATUS_BY_CODE` (400)
- `workers/transcription-api/src/transcribe.ts` — switch the two validation-failure paths from `internal` to `bad_request`
- `workers/transcription-api/src/post-process.ts` — switch the three validation-failure paths from `internal` to `bad_request`
- `workers/transcription-api/src/prompts.ts` — replace `task in TEMPLATES` with a `Set` lookup; widen the param to `unknown`
- `src/hooks/useRecordingWorkflow.ts` — guarantee a single user-facing notification per transcription failure: cloud branch toasts (with a generic fallback when no specific i18n key matches), outer catch skips the alert for `CloudApiError`

---

## Task 1: B3 — Harden `isValidTask` against prototype pollution

**Files:**
- Create: `workers/transcription-api/src/prompts.test.ts`
- Modify: `workers/transcription-api/src/prompts.ts`

The current implementation uses the `in` operator, which traverses the prototype chain. `"toString" in TEMPLATES` is `true`, so `getPromptTemplate("toString")` returns `Object.prototype.toString` (a function with no `.system` / `.buildUser`), and `post-process.ts:54` crashes when it accesses those fields. Fix is a typed-Set lookup.

- [ ] **Step 1: Write the failing test**

Create `workers/transcription-api/src/prompts.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { isValidTask, getPromptTemplate } from "./prompts";

describe("isValidTask", () => {
  it("accepts the four documented tasks", () => {
    expect(isValidTask("reformulate")).toBe(true);
    expect(isValidTask("correct")).toBe(true);
    expect(isValidTask("email")).toBe(true);
    expect(isValidTask("summarize")).toBe(true);
  });

  it("rejects Object.prototype keys", () => {
    expect(isValidTask("toString")).toBe(false);
    expect(isValidTask("constructor")).toBe(false);
    expect(isValidTask("hasOwnProperty")).toBe(false);
    expect(isValidTask("__proto__")).toBe(false);
  });

  it("rejects unknown strings", () => {
    expect(isValidTask("translate")).toBe(false);
    expect(isValidTask("")).toBe(false);
  });

  it("rejects non-string inputs", () => {
    expect(isValidTask(undefined as unknown as string)).toBe(false);
    expect(isValidTask(42 as unknown as string)).toBe(false);
    expect(isValidTask(null as unknown as string)).toBe(false);
    expect(isValidTask({} as unknown as string)).toBe(false);
  });
});

describe("getPromptTemplate", () => {
  it("returns a template with system + buildUser for every valid task", () => {
    for (const task of ["reformulate", "correct", "email", "summarize"] as const) {
      const tpl = getPromptTemplate(task);
      expect(typeof tpl.system).toBe("string");
      expect(tpl.system.length).toBeGreaterThan(0);
      expect(typeof tpl.buildUser).toBe("function");
    }
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
cd workers/transcription-api && pnpm test prompts
```

Expected: `Object.prototype keys` block fails — `isValidTask("toString")` returns `true`. Also `non-string inputs` fails because `null in TEMPLATES` throws TypeError (the `in` operator rejects nullish RHS-input pairs in some engines; the actual failure mode depends on V8, but at minimum the prototype-keys test will fail).

- [ ] **Step 3: Fix `isValidTask`**

Replace the body of `workers/transcription-api/src/prompts.ts:42-44` with a typed Set lookup. The full updated file:

```typescript
export type PostProcessTask = "reformulate" | "correct" | "email" | "summarize";

export interface PromptTemplate {
  system: string;
  buildUser: (input: string, language?: string) => string;
}

const langClause = (lang?: string) =>
  lang ? `\n\nLangue de réponse : ${lang}.` : "";

const TEMPLATES: Record<PostProcessTask, PromptTemplate> = {
  reformulate: {
    system:
      "Tu es un assistant qui reformule un texte pour le rendre plus clair, concis et naturel, en conservant strictement le sens et l'intention de l'auteur. Tu ne rajoutes ni ne retires d'information. Réponds avec uniquement le texte reformulé, sans préambule.",
    buildUser: (input, lang) =>
      `Texte à reformuler :\n\n${input}${langClause(lang)}`,
  },
  correct: {
    system:
      "Tu es un correcteur orthographique et grammatical. Tu corriges les fautes sans modifier le style ni le sens. Réponds avec uniquement le texte corrigé.",
    buildUser: (input, lang) =>
      `Texte à corriger :\n\n${input}${langClause(lang)}`,
  },
  email: {
    system:
      "Tu transformes une note dictée en un email professionnel concis et bien structuré. Tu inclus un objet pertinent, une formule d'appel adaptée et une formule de politesse. Réponds avec uniquement l'email final, format texte brut.",
    buildUser: (input, lang) =>
      `Note à transformer en email :\n\n${input}${langClause(lang)}`,
  },
  summarize: {
    system:
      "Tu résumes un texte en gardant l'essentiel, en 3-5 puces. Réponds avec uniquement les puces, format texte brut.",
    buildUser: (input, lang) =>
      `Texte à résumer :\n\n${input}${langClause(lang)}`,
  },
};

// Set lookup, not `in` operator: avoids prototype-chain hits like "toString".
const VALID_TASKS = new Set<PostProcessTask>([
  "reformulate",
  "correct",
  "email",
  "summarize",
]);

export function getPromptTemplate(task: PostProcessTask): PromptTemplate {
  return TEMPLATES[task];
}

export function isValidTask(task: unknown): task is PostProcessTask {
  return typeof task === "string" && VALID_TASKS.has(task as PostProcessTask);
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
cd workers/transcription-api && pnpm test prompts
```

Expected: 3 describe blocks, all green.

- [ ] **Step 5: Run typecheck**

```bash
cd workers/transcription-api && pnpm typecheck
```

Expected: no errors. (The `task: unknown` widening in `isValidTask` flows correctly because `post-process.ts:30` calls it on `body.task` which is typed `string` — the widening only adds defensive runtime checks, not type errors at the call site.)

- [ ] **Step 6: Commit**

```bash
git add workers/transcription-api/src/prompts.ts workers/transcription-api/src/prompts.test.ts
git commit -m "fix(cloud): harden isValidTask against prototype pollution"
```

---

## Task 2: B2 — Add `bad_request` error code for client-input validation

**Files:**
- Modify: `workers/transcription-api/src/errors.ts`
- Modify: `workers/transcription-api/src/transcribe.ts`
- Modify: `workers/transcription-api/src/post-process.ts`
- Create test (extends existing): `workers/transcription-api/src/errors.test.ts`

Five validation paths currently use `errorResponse("internal", ...)` and return HTTP 500. They are: missing multipart body, missing `audio` part, invalid JSON body, unknown task name, and missing/empty `text`. All five are 4xx errors. Add a `bad_request` code mapped to 400 and reroute them.

- [ ] **Step 1: Write the failing test**

Create `workers/transcription-api/src/errors.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { errorResponse } from "./errors";

describe("errorResponse", () => {
  it("maps bad_request to HTTP 400", () => {
    const res = errorResponse("bad_request", "missing audio part");
    expect(res.status).toBe(400);
  });

  it("maps internal to HTTP 500", () => {
    const res = errorResponse("internal", "boom");
    expect(res.status).toBe(500);
  });

  it("returns a JSON body with the error code and message", async () => {
    const res = errorResponse("bad_request", "missing audio part");
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("missing audio part");
  });

  it("includes Content-Type: application/json", () => {
    const res = errorResponse("bad_request", "x");
    expect(res.headers.get("content-type")).toBe("application/json");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
cd workers/transcription-api && pnpm test errors
```

Expected: TypeScript error — `"bad_request"` is not assignable to type `ErrorCode`.

- [ ] **Step 3: Add `bad_request` to the `ErrorCode` union and the status map**

Edit `workers/transcription-api/src/errors.ts`:

```typescript
export type ErrorCode =
  | "missing_auth"
  | "invalid_auth"
  | "expired_auth"
  | "bad_request"
  | "quota_exhausted"
  | "trial_expired"
  | "payload_too_large"
  | "unsupported_format"
  | "provider_unavailable"
  | "internal";

export interface ErrorBody {
  error: ErrorCode;
  message: string;
  request_id?: string;
}

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  missing_auth: 401,
  invalid_auth: 401,
  expired_auth: 401,
  bad_request: 400,
  quota_exhausted: 402,
  trial_expired: 402,
  payload_too_large: 413,
  unsupported_format: 415,
  provider_unavailable: 502,
  internal: 500,
};

export function errorResponse(
  code: ErrorCode,
  message: string,
  requestId?: string,
): Response {
  const body: ErrorBody = {
    error: code,
    message,
    ...(requestId ? { request_id: requestId } : {}),
  };
  return new Response(JSON.stringify(body), {
    status: STATUS_BY_CODE[code],
    headers: { "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
cd workers/transcription-api && pnpm test errors
```

Expected: 4 assertions, all green.

- [ ] **Step 5: Reroute the two validation paths in `transcribe.ts`**

Edit `workers/transcription-api/src/transcribe.ts:24-34`. Change `errorResponse("internal", ...)` to `errorResponse("bad_request", ...)` for the multipart-parse failure and the missing-audio-part case. Concretely:

```typescript
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorResponse("bad_request", "expected multipart/form-data body");
  }

  const audio = form.get("audio");
  // FormDataEntryValue is `string | File | null` ; we want File (which extends Blob).
  if (audio === null || typeof audio === "string") {
    return errorResponse("bad_request", "missing 'audio' part");
  }
```

- [ ] **Step 6: Reroute the three validation paths in `post-process.ts`**

Edit `workers/transcription-api/src/post-process.ts:23-35`. Change the three `errorResponse("internal", ...)` calls to `errorResponse("bad_request", ...)`:

```typescript
  let body: PostProcessBody;
  try {
    body = (await req.json()) as PostProcessBody;
  } catch {
    return errorResponse("bad_request", "invalid JSON body");
  }

  if (!isValidTask(body.task)) {
    return errorResponse("bad_request", `unknown task: ${body.task}`);
  }
  if (typeof body.text !== "string" || !body.text.trim()) {
    return errorResponse("bad_request", "missing or empty 'text'");
  }
```

- [ ] **Step 7: Run typecheck and the full worker test suite**

```bash
cd workers/transcription-api && pnpm typecheck && pnpm test
```

Expected: typecheck clean, all existing tests still green (auth, usage, prompts, errors).

- [ ] **Step 8: Commit**

```bash
git add workers/transcription-api/src/errors.ts workers/transcription-api/src/errors.test.ts workers/transcription-api/src/transcribe.ts workers/transcription-api/src/post-process.ts
git commit -m "fix(cloud): map client validation errors to HTTP 400 (bad_request)"
```

---

## Task 3: B1 — Dedupe cloud error notifications in the recording workflow

**Files:**
- Modify: `src/hooks/useRecordingWorkflow.ts`

The cloud transcription branch (`useRecordingWorkflow.ts:479-493`) toasts a localized error for known statuses (401/402/502) and re-throws. The outer catch at `:560-564` then fires a blocking `alert()` containing the raw `CloudApiError` stringification — so the user sees two notifications, one of which is unlocalized and modal.

There is no React-component test infrastructure in this repo; this fix is verified by manual smoke test (recording flow with the network blocked, with a 401 forced via expired JWT, and with a 402 forced via empty trial). The change is small enough that the diff is self-evident, but the manual verification step is **not optional**.

The fix has two halves:
1. The cloud branch always toasts on `CloudApiError` — including a generic fallback for statuses without a specific i18n key (e.g. 400 `bad_request`, 413, 415).
2. The outer catch skips the alert when the error is a `CloudApiError`. It still emits `transcription-error` (mini window listens) and logs to console.

Non-`CloudApiError` failures (genuine bugs, local-path failures) keep the existing `alert()` behavior — that's out of scope for this fix.

- [ ] **Step 1: Add a generic fallback toast in the cloud branch**

Edit `src/hooks/useRecordingWorkflow.ts:479-493` (the `catch (err)` block inside the cloud transcription path). Replace the existing block with:

```typescript
          } catch (err) {
            if (err instanceof CloudApiError) {
              const key = err.isQuotaIssue()
                ? "errors.quota_exhausted"
                : err.isAuthIssue()
                  ? "errors.auth_expired"
                  : err.isProviderUnavailable()
                    ? "errors.provider_unavailable"
                    : null;
              if (key) {
                toast.error(tRef.current(`cloud:${key}`));
              } else {
                // Generic fallback for statuses without a dedicated i18n key
                // (e.g. 400 bad_request, 413, 415). Outer catch will skip the
                // alert because we already surfaced this to the user.
                toast.error(
                  tRef.current("errors.transcriptionError", { error: err.message }),
                );
              }
            }
            throw err;
          }
```

The single change vs. the current code is the `else` branch with the generic `toast.error`. Without it, an unknown-status `CloudApiError` would skip the inner toast AND hit the outer alert-skip in the next step — the user would see nothing.

- [ ] **Step 2: Skip the outer alert for `CloudApiError`**

Edit `src/hooks/useRecordingWorkflow.ts:560-564` (the outer `catch (error)` block of `transcribeAudio`). Replace it with:

```typescript
      } catch (error) {
        console.error("Transcription error:", error);
        await emit("transcription-error", { error: String(error) });
        // CloudApiError was already toasted by the cloud branch above; the
        // alert below is for genuine local-path bugs / unhandled failures.
        if (!(error instanceof CloudApiError)) {
          alert(tRef.current('errors.transcriptionError', { error }));
        }
        await invoke("log_separator");
      } finally {
        setIsTranscribing(false);
      }
```

- [ ] **Step 3: Verify nothing else in the file relies on the alert always firing**

```bash
grep -n "alert(" src/hooks/useRecordingWorkflow.ts
```

Expected: two matches — line 563 (the one we just guarded) and line 703 (`handleToggleRecording` for recording-start failures, unrelated to this fix). No other call sites.

- [ ] **Step 4: Run the existing api.test.ts to confirm `CloudApiError` plumbing is unchanged**

```bash
pnpm test src/lib/cloud/api.test.ts
```

Expected: all green. (This test exercises `CloudApiError.fromTauri` indirectly; we did not touch it, so it should pass.)

- [ ] **Step 5: Run frontend typecheck**

```bash
pnpm build
```

Expected: TypeScript compilation succeeds.

- [ ] **Step 6: Manual smoke test (mandatory)**

The fix targets runtime UX, not type-checkable behavior. Run the app (`pnpm tauri dev`, executed by the user — the agent cannot run this) and exercise three scenarios:

1. **Network failure** — disconnect Wi-Fi, hit Ctrl+F11 to record, speak, release. Expected: one `toast.error` with the localized "transcription failed" message; no JS modal alert.
2. **Forced 401** — sign out of Supabase mid-session (or expire the JWT manually), then trigger a cloud transcription. Expected: one `toast.error` with `cloud:errors.auth_expired`; no modal.
3. **Forced 402** — set `trial_credits.minutes_consumed = trial_credits.minutes_granted` on a test user, ensure no active subscription, trigger a cloud transcription. Expected: one `toast.error` with `cloud:errors.quota_exhausted`; no modal.

If any scenario produces zero toasts OR a modal alert, the fix is incomplete — re-check the two edits above.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useRecordingWorkflow.ts
git commit -m "fix(cloud): avoid double notification on cloud transcription errors"
```

---

## Wrap-up

- [ ] **Step 1: Final full check from the repo root**

```bash
pnpm build
cd workers/transcription-api && pnpm typecheck && pnpm test && cd ../..
```

Expected: frontend builds, worker typechecks, all worker tests pass.

- [ ] **Step 2: Push the branch**

```bash
git push origin docs/05-managed-transcription-design
```

- [ ] **Step 3: Update the PR description / changelog**

Append a "Second-review fixes" section to the PR description summarizing the three fixes (B1, B2, B3) and link to this plan. The CHANGELOG entry stays in English per the repo convention; one bullet per fix, terse:

```markdown
### Fixed
- Cloud: client validation errors now return HTTP 400 instead of 500.
- Cloud: prompt-task validation hardened against prototype pollution.
- Cloud: deduplicated user-facing error notifications on transcription failures.
```

---

## Out of Scope

The following items from the second review are deferred to follow-up tasks (tracked separately, not gating v3.0):

- **I1**: hoist `reqwest::Client` into a `OnceLock` in `cloud.rs`
- **I2**: add HTTP timeout to cloud calls
- **I3**: enforce `MAX_AUDIO_BYTES` via `Content-Length` before buffering
- **I4**: add `expires_at > NOW()` guard to the trial-bump trigger
- **I5**: validate `iss` / `aud` claims in JWT verification
- **I6**: gate transcription `console.log` behind a debug setting
- **N1–N5**: blob mime check tightening, JWKS amplification, OpenAI 4xx mapping, post-process custom-mode UI flicker, wrangler compat date hygiene
- **Q1**: retry on 502/503 in the frontend
- **Q2**: document trial-minutes-only-cover-transcription behavior in the runbook
