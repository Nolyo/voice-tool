# Streaming Transcription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live sentence-by-sentence transcription while recording (cloud-only), via Rust-side silence segmentation + per-segment upload to the existing `/transcribe` worker endpoint.

**Architecture:** Rust taps the cpal audio callback into a segmenter worker thread that cuts speech at natural pauses and emits `streaming-chunk` events. The frontend uploads each chunk through the existing `transcribeCloud()` client (sequential queue), assembles ordered text, broadcasts `streaming-transcript` for live display (mini window + dashboard), and on session end pushes the assembled text through the unchanged finalization pipeline (post-process → snippets → history → paste).

**Tech Stack:** Rust (cpal, std::sync::mpsc, tauri events), React 19 + TS (Tauri invoke/listen), Vitest, cargo test.

**Spec:** `docs/superpowers/specs/2026-07-02-streaming-transcription-design.md`

## Global Constraints

- Batch behavior strictly unchanged when `streaming_mode = false` (default) and for provider Local.
- No server/worker changes; every chunk is a normal `/transcribe` request billed as today.
- All UI strings via react-i18next (fr + en). CHANGELOG in English. Conventional commits.
- No new Rust/npm dependencies.
- Rust build commands need: `export PATH="$PATH:/c/Program Files/CMake/bin"` and `LIBCLANG_PATH="C:/Program Files/LLVM/bin"`; use `--no-default-features` (documented CPU fallback) and `CARGO_TARGET_DIR=C:/Users/nolyo/www/voice-tool/src-tauri/target` to reuse the main checkout's cache.
- Event payload keys are camelCase (matches `audio-captured` precedent).

## Event Contract (produced by Task 2, consumed by Tasks 5/7)

| Event | Payload | Emitter |
|---|---|---|
| `streaming-session-started` | `{ sessionId: number, sampleRate: number }` | Rust, tap installed |
| `streaming-chunk` | `{ sessionId, chunkIndex, samples: number[], sampleRate, startMs, endMs }` | Rust worker |
| `streaming-session-end` | `{ sessionId, totalChunks }` | Rust worker (after flush) |
| `streaming-session-cancelled` | `{ sessionId }` | Rust worker (Escape) |
| `streaming-transcript` | `{ sessionId, text }` | Frontend (assembled so far) |

---

### Task 1: Rust `SpeechSegmenter` (pure state machine) + unit tests

**Files:**
- Create: `src-tauri/src/streaming.rs` (segmenter part only)
- Modify: `src-tauri/src/lib.rs` (add `mod streaming;` next to `mod audio_trim;`)

**Interfaces (Produces):**
```rust
pub struct SegmenterConfig { /* all ms fields u32, thresholds f32 */
    pub sample_rate: u32,
    pub window_ms: u32,          // 20
    pub silence_gap_ms: u32,     // 600  — silence run that triggers a cut
    pub min_segment_ms: u32,     // 1400 — no silence-cut before this
    pub max_segment_ms: u32,     // 15000 — force cut
    pub force_cut_lookback_ms: u32, // 2000 — search window for min-RMS forced cut
    pub tail_padding_ms: u32,    // 250 — trailing silence kept on cut
    pub pre_roll_ms: u32,        // 250 — leading silence kept before first speech
    pub threshold_fraction: f32, // 0.10 (of running peak RMS)
    pub min_threshold: f32,      // 0.004
    pub max_threshold: f32,      // 0.020
    pub noise_floor_peak: f32,   // 0.010 — below ⇒ nothing is speech
}
impl SegmenterConfig { pub fn new(sample_rate: u32) -> Self /* defaults above */ }

pub struct Segment { pub samples: Vec<i16>, pub start_ms: u64, pub end_ms: u64 }

pub struct SpeechSegmenter { /* private */ }
impl SpeechSegmenter {
    pub fn new(config: SegmenterConfig) -> Self;
    /// Feed a batch of mono i16 samples; returns 0..n completed segments.
    pub fn push(&mut self, samples: &[i16]) -> Vec<Segment>;
    /// End of stream: returns the trailing segment if it contains speech.
    pub fn flush(&mut self) -> Option<Segment>;
}
```

**Algorithm (internal):** accumulate incoming samples; process complete 20 ms windows. Per window: RMS (same normalization as `audio_trim::rms`); update running peak; `threshold = (peak * threshold_fraction).clamp(min, max)`; window is speech iff `peak >= noise_floor_peak && rms > threshold`. State: `buffer: Vec<i16>`, `buffer_start_ms`, `has_speech`, `speech_windows: u32`, `silence_run_ms`, `total_ms`. Rules:
1. Silence window while `!has_speech`: keep buffer as pre-roll only — truncate front so buffer ≤ `pre_roll_ms` (advance `buffer_start_ms` accordingly). Memory stays bounded during long pauses.
2. Speech window: append, `has_speech = true`, `speech_windows += 1`, `silence_run_ms = 0`.
3. Silence window while `has_speech`: append, `silence_run_ms += window_ms`; if `silence_run_ms >= silence_gap_ms` and segment duration ≥ `min_segment_ms` → **cut**: emit `buffer[..len - (silence_run_ms - tail_padding_ms)]` worth of samples (keep `tail_padding_ms` of the silence tail); the segment counts only if `speech_windows >= 2` (else discard, click guard). Remaining silence is dropped; next buffer starts empty at current position.
4. Segment duration ≥ `max_segment_ms` with speech → **force cut** at the min-RMS window inside the last `force_cut_lookback_ms`; remainder (after the cut point) is carried over as the start of the next buffer with `has_speech = true`, `speech_windows = 1`.
5. `flush()`: if `has_speech && speech_windows >= 2` emit remaining buffer (no min-duration requirement), else `None`.

- [x] **Step 1: Write failing tests** in `#[cfg(test)] mod tests` (reuse the `silence()/speech()` generators pattern from `audio_trim.rs`, SR = 48 000):
  - `cuts_at_natural_pause`: 3 s speech + 1 s silence + 2 s speech + `flush` → 2 segments; first ends ≈ 3 s + tail padding (assert `end_ms` in [3000, 3600]); second contains the later speech.
  - `no_cut_before_min_duration`: 0.8 s speech + 1 s silence + 1 s speech + flush → 1 segment min_segment prevents early cut) — assert single segment spans everything up to flush.
  - `pure_silence_emits_nothing`: 10 s silence → push returns empty, flush → None.
  - `isolated_click_discarded`: 2 s silence + 20 ms speech + 2 s silence + flush → no segment.
  - `force_cut_on_long_speech`: 20 s continuous speech → at least one segment emitted before flush; every segment ≤ 15.5 s.
  - `speech_is_contiguous_across_cuts`: total speech samples across segments + flush ≥ total speech samples fed (no speech lost; compare sample counts with tolerance of a few windows).
  - `flush_returns_short_tail`: 3 s speech + cut-triggering silence + 0.6 s speech + flush → flush yields the short tail.
  - `long_pause_bounded_memory`: 60 s silence pushed in batches → internal buffer stays ≤ pre_roll (expose via `#[cfg(test)] fn buffered_len(&self)`).
- [x] **Step 2: Run** `cargo test --no-default-features streaming` → FAIL (module skeleton compiles, tests fail or don't compile yet — write skeleton first so failure is assertions, not syntax).
- [x] **Step 3: Implement** the segmenter per the algorithm above.
- [x] **Step 4: Run** same command → PASS (all 8 + existing suite untouched).
- [x] **Step 5: Commit** `feat: add speech segmenter for streaming transcription`

### Task 2: Rust tap + streaming runtime + command/hotkey wiring

**Files:**
- Modify: `src-tauri/src/audio.rs` (chunk tap + `current_sample_rate()`)
- Modify: `src-tauri/src/streaming.rs` (TapMsg, worker, session helpers)
- Modify: `src-tauri/src/state.rs` (`streaming: Mutex<StreamingRuntime>`)
- Modify: `src-tauri/src/commands/settings.rs` (`set_streaming_enabled`)
- Modify: `src-tauri/src/commands/recording.rs` (start/stop wiring)
- Modify: `src-tauri/src/hotkeys.rs` (start/stop/cancel wiring + skip `audio-captured`)
- Modify: `src-tauri/src/lib.rs` (register `set_streaming_enabled`)

**Interfaces (Produces):**
```rust
// streaming.rs
pub enum TapMsg { Samples(Vec<i16>), Finish, Abort }
pub(crate) struct StreamingRuntime { pub enabled: bool, session_seq: u64, tap: Option<std::sync::mpsc::Sender<TapMsg>> }
/// After recorder.start_recording() succeeded. Installs tap + spawns worker when enabled.
pub(crate) fn maybe_start_streaming_session<R: tauri::Runtime>(state: &AppState, recorder: &mut AudioRecorder, app_handle: &AppHandle<R>);
/// Sends Finish (stop) or Abort (cancel); returns true if a session was active.
pub(crate) fn end_streaming_session(state: &AppState, recorder: &mut AudioRecorder, abort: bool) -> bool;
// audio.rs
impl AudioRecorder { pub fn set_chunk_tap(&mut self, tap: Option<Sender<TapMsg>>); pub fn current_sample_rate(&self) -> u32; }
// commands/settings.rs
#[tauri::command] pub fn set_streaming_enabled(state: State<AppState>, enabled: bool) -> Result<(), String>;
```

Wiring rules:
- Callback (`build_input_stream`): after mono conversion and (not monitor_only) buffering, `if let Some(tx) = tap { let _ = tx.send(TapMsg::Samples(samples.clone())); }` — lock the tap mutex once per callback, ignore send errors (worker gone).
- Worker thread (std::thread): owns `SpeechSegmenter`; on `Samples` push + emit each `Segment` as `streaming-chunk` (chunkIndex counter); on `Finish` flush → maybe emit last chunk → emit `streaming-session-end`; on `Abort` or channel disconnect-without-Finish → emit `streaming-session-cancelled` (disconnect after Finish already returned). Emits via `AppHandle` (`serde_json::json!` camelCase payloads).
- `commands/recording.rs::start_recording`: after successful `recorder.start_recording(...)`, call `maybe_start_streaming_session(...)` (recorder still locked). Same in `hotkeys.rs::start_recording_shortcut`. **Not** in `start_audio_monitor` (mic test must never stream).
- `commands/recording.rs::stop_recording`: after `recorder.stop_recording(...)`, `end_streaming_session(state, &mut recorder, false)`.
- `hotkeys.rs::stop_recording_shortcut`: same; return the flag so the record/PTT handlers **skip `emit_audio_samples` when a streaming session was active**.
- `hotkeys.rs::cancel_recording_shortcut`: `end_streaming_session(..., true)`.
- `set_streaming_enabled` only flips `StreamingRuntime.enabled` (pattern of `set_cloud_gate`).

- [x] **Step 1: Implement** all of the above (no practical unit test for cpal wiring; the segmenter is already covered — keep worker logic thin).
- [x] **Step 2: Run** `cargo check --no-default-features` then `cargo test --no-default-features` → PASS, no warnings introduced.
- [x] **Step 3: Commit** `feat: wire streaming session tap into recording paths`

### Task 3: Frontend assembler (pure) + Vitest

**Files:**
- Create: `src/lib/streaming/assembler.ts`
- Test: `src/lib/streaming/assembler.test.ts`

**Interfaces (Produces):**
```ts
export class TranscriptAssembler {
  upsert(index: number, text: string): void;
  markFailed(index: number): void;
  assembled(): string;          // ordered join, single spaces, trimmed
  get okCount(): number;
  get failedCount(): number;
}
```

- [x] **Step 1: Failing tests**: ordered join out-of-order upserts; gap (missing index) skipped; failed chunk excluded from join but counted; empty/whitespace chunk text ignored in join; double upsert same index overwrites.
- [x] **Step 2:** `pnpm vitest run src/lib/streaming` → FAIL.
- [x] **Step 3: Implement** with a `Map<number, string>`.
- [x] **Step 4:** `pnpm vitest run src/lib/streaming` → PASS.
- [x] **Step 5: Commit** `feat: add streaming transcript assembler`

### Task 4: Frontend session queue + error policy + Vitest

**Files:**
- Create: `src/lib/streaming/session.ts`
- Test: `src/lib/streaming/session.test.ts`

**Interfaces (Produces):**
```ts
export interface StreamingChunkPayload { sessionId: number; chunkIndex: number; samples: number[]; sampleRate: number; startMs: number; endMs: number; }
export type ChunkTransport = (chunk: StreamingChunkPayload, jwt: string, language?: string) => Promise<{ text: string; duration_ms: number }>;
export interface StreamingOutcome { text: string; billedMs: number; chunksOk: number; chunksFailed: number; aborted: boolean; }
export type FatalReason = "quota" | "auth" | "network";
export interface StreamingSessionOptions {
  sessionId: number; language?: string;
  getJwt: () => Promise<string | undefined>;
  transport: ChunkTransport;
  onTranscript: (assembledText: string) => void;
  onFatal: (reason: FatalReason, error: unknown) => void; // caller aborts recording
  maxConsecutiveFailures?: number; // default 2
}
export class StreamingUploadSession {
  constructor(opts: StreamingSessionOptions);
  enqueue(chunk: StreamingChunkPayload): void;   // sequential pump, 1 in flight
  finish(): Promise<StreamingOutcome>;           // resolves after queue drains
  abort(): void;                                 // drops pending work
  get active(): boolean;
}
```
Error policy (in pump): missing JWT → `onFatal("auth")` + abort. `CloudApiError.isQuotaIssue()` → `onFatal("quota")` + abort. `.isAuthIssue()` → `onFatal("auth")` + abort. Any other error → `markFailed(index)`, increment consecutive-failure counter; when it exceeds `maxConsecutiveFailures` → `onFatal("network")` + abort; a success resets the counter. (`transcribeCloud` already retries transient network errors internally.)

- [x] **Step 1: Failing tests** with an injected fake transport (no Tauri imports): resolves in order with out-of-order transport latencies (sequentiality asserted via in-flight counter); `finish()` waits for queued uploads; quota error → onFatal("quota") + aborted outcome; 3 consecutive network failures (default max 2) → onFatal("network"); 1 failure then success → no fatal, failed chunk skipped in text, billedMs sums only ok chunks; abort() drops queue.
- [x] **Step 2:** run → FAIL. **Step 3: Implement** (promise-chain pump). **Step 4:** run → PASS.
- [x] **Step 5: Commit** `feat: add streaming upload session with error policy`

### Task 5: `useStreamingSession` hook + `useRecordingWorkflow` integration

**Files:**
- Create: `src/hooks/useStreamingSession.ts`
- Modify: `src/hooks/useRecordingWorkflow.ts`
- Modify: `src/components/Dashboard.tsx` (pass-through of `liveTranscript`/`isStreamingSession` — final render location decided in Task 7)

**Interfaces (Produces):**
```ts
// useStreamingSession({ settings, onFinalize, onEmpty }) → { liveTranscript, isStreamingSession }
// onFinalize(text: string, billedSeconds: number, chunksFailed: number): Promise<void>
// onEmpty(): void  — session ended with zero speech chunks
```
Behavior:
- Listens `streaming-session-started` → new `StreamingUploadSession` (transport wraps `transcribeCloud` with `idempotencyKey = "${sessionId}-${chunkIndex}"`; `getJwt` reads `supabase.auth.getSession()`), resets `liveTranscript`.
- `streaming-chunk` → `enqueue`; `onTranscript` → `setLiveTranscript` + `emit("streaming-transcript", { sessionId, text })`.
- `streaming-session-end` → `emit("transcription-start", { provider: "Cloud" })`, `await finish()`; zero ok chunks → `onEmpty()`; else `onFinalize(text, billedMs/1000, chunksFailed)`.
- `streaming-session-cancelled` → `abort()`, reset.
- `onFatal` → toast the existing cloud i18n keys (`cloud:errors.quota_exhausted` / `errors.auth_expired` / generic network), `emit("transcription-error", ...)`, and `invoke("stop_recording", { silenceThreshold: settings.silence_threshold })` to stop the mic (guarded so a stop already in progress is fine).
- Ref-trampoline pattern for callbacks (same as existing listeners); sessionId guards stale events.

`useRecordingWorkflow` changes:
- Instantiate the hook; `onFinalize` runs: `setIsTranscribing(true)` → `maybePostProcessCloud` (same eligibility as cloud batch) → `handleTranscriptionFinal(text, "whisper", "", 0, originalText, undefined, ppCost, billedSeconds, "Cloud")` → `emit("transcription-success", { text })` → `setIsTranscribing(false)`; `chunksFailed > 0` → `toast.warning(t("streaming.partialLoss"))`.
- `onEmpty` → existing `noSound` toast + `transcription-error` emit.
- Button stop path: when `isStreamingSessionRef.current`, skip the `transcribeAudio(...)` call **and** the silent-toast (session events handle both).
- `audio-captured` listener: `if (isStreamingSessionRef.current) return;` defensive guard (Rust already skips the emit).
- `isStreaming: true` on the history entry: extend `AddTranscription` signature and `useTranscriptionHistory.addTranscription` with `isStreaming?: boolean` (last param) and set it from `onFinalize`.
- Return `{ liveTranscript, isStreamingSession }` from `useRecordingWorkflow`.

- [x] **Step 1: Implement** hook + integration.
- [x] **Step 2:** `pnpm build` (tsc) → PASS; `pnpm vitest run` → suite PASS.
- [x] **Step 3: Commit** `feat: orchestrate streaming uploads and finalization in recording workflow`

### Task 6: Setting + gate push + Settings UI + i18n

**Files:**
- Modify: `src/lib/settings.ts` (`streaming_mode: boolean`, default `false`)
- Modify: `src/contexts/CloudContext.tsx` (push `set_streaming_enabled` alongside `set_cloud_gate`: `enabled = settings.streaming_mode && mode === "cloud"`)
- Modify: `src/components/settings/sections/TranscriptionSection.tsx` (toggle; teaser row disabled + Cloud badge when provider Local or ineligible)
- Modify: `src/locales/fr.json`, `src/locales/en.json`

i18n keys (translation ns): `settings.transcription.streaming.title`, `.description`, `.cloudOnly` (teaser hint), and top-level `streaming.partialLoss` (toast). FR + EN.

- [x] **Step 1: Implement** (follow the section's existing toggle/PickerCard patterns; reuse eligibility signals already present in the section).
- [x] **Step 2:** `pnpm build` → PASS. Grep check: no hardcoded UI strings.
- [x] **Step 3: Commit** `feat: add streaming mode setting with cloud-exclusive UI`

### Task 7: Live display — mini window + dashboard

**Files:**
- Modify: `src/hooks/useMiniWindowState.ts` (listen `streaming-transcript` → `liveTranscript`; reset on `recording-state` true)
- Modify: `src/components/mini-window/MiniShell.tsx` (+ new `src/components/mini-window/MiniLiveTranscript.tsx`): while `status === "recording"` and `liveTranscript` non-empty, render one-line tail of the live text (CSS `direction: rtl`-safe tail or JS tail-slice, left fade mask, `aria-live="polite"`), sharing the row with the visualizer + timer.
- Modify: dashboard recording surface (`AccueilTab`/`RecordingCard` — pick the component that renders the recording state) to show the growing live transcript while `isStreamingSession`.

- [x] **Step 1: Implement** mini + dashboard live views (i18n for any label).
- [x] **Step 2:** `pnpm build` + `pnpm vitest run` → PASS.
- [x] **Step 3: Commit** `feat: live transcript display in mini window and dashboard`

### Task 8: Docs, verification, PR

**Files:**
- Modify: `CHANGELOG.md` (English, Unreleased), `CLAUDE.md` (short streaming section)
- Create: `docs/v3/streaming-e2e-checklist.md` (button, hotkey toggle, PTT, cancel, quota exhausted, offline mid-dictation, mini live text, final paste, batch parity when disabled)

- [x] **Step 1:** Full verification: `cargo test --no-default-features`, `cargo check --no-default-features`, `pnpm build`, `pnpm vitest run` → all PASS (paste outputs in PR).
- [x] **Step 2:** Self code-review of the full diff (`git diff main`).
- [x] **Step 3:** Commit docs `docs: changelog + e2e checklist for streaming mode`, push branch, open PR to `main` (gh CLI) with full description — no merge.

## Self-Review Notes

- Spec §3.2 covered by Tasks 1-2; §3.3 by Tasks 3-6; mini/dashboard by Task 7; §6 tests by Tasks 1/3/4; §9 by Task 8.
- Type checks: `TapMsg` shared audio.rs ↔ streaming.rs (exported from streaming.rs); `StreamingChunkPayload` field names match the Rust `json!` payload exactly (camelCase); `AddTranscription` extension is additive-optional (no call-site breakage).
- Deliberately not planned: settings sync of `streaming_mode`, local streaming, live insertion (spec §7).
