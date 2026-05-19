// deno-lint-ignore-file no-explicit-any
//
// Anonymous demo transcription. The onboarding "Try it" step calls this
// endpoint so brand-new users without a model OR an account can hear (and
// see) Lexena work end-to-end — which is the strongest argument for the
// Cloud trial.
//
// Protections:
//   • 15s hard cap on audio duration (rejected server-side)
//   • Max 3 successful demos per IP / hour
//   • Max 2 successful demos per device (lifetime)
//   • All attempts logged in public.demo_attempts (no PII; ip + device hashed)
//
// Required env: OPENAI_API_KEY_DEMO, DEMO_HASH_PEPPER, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";
import { corsHeaders, preflight } from "../_shared/cors.ts";

const MAX_DURATION_SECONDS = 15;
const IP_WINDOW_SECONDS = 3600;
const IP_MAX_SUCCESSES = 3;
const DEVICE_MAX_SUCCESSES_LIFETIME = 2;

export interface DemoTranscribeDeps {
  pepper: string;
  openaiApiKey: string;
  client: SupabaseClient<any, any, any>;
  getClientIp: (req: Request) => string;
  transcribe: (wav: Blob, language: string | null) => Promise<{ text: string }>;
  now: () => Date;
}

interface AttemptRow {
  ip_hash: string;
  device_id_hash: string;
  duration_seconds: number | null;
  success: boolean;
  error_code: string | null;
  text_length: number | null;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Returns the duration of a 16-bit PCM WAV in seconds from its header.
 * We trust the duration claimed by the client but ALSO re-derive it from the
 * WAV header to defeat a client lying about it. Falls back to NaN if header
 * is unparseable — caller treats that as a 400.
 */
function wavDurationSeconds(bytes: Uint8Array): number {
  // RIFF header: 0..3="RIFF", 8..11="WAVE", 12..15="fmt ", 24..27=sample rate
  if (bytes.length < 44) return NaN;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Validate "RIFF" and "WAVE" magic.
  if (
    view.getUint32(0, false) !== 0x52494646 ||
    view.getUint32(8, false) !== 0x57415645
  ) {
    return NaN;
  }
  const sampleRate = view.getUint32(24, true);
  const numChannels = view.getUint16(22, true);
  const bitsPerSample = view.getUint16(34, true);
  // Find "data" chunk size; skip past fmt chunk (variable length).
  // Walk chunks from byte 12.
  let offset = 12;
  while (offset < bytes.length - 8) {
    const chunkId = view.getUint32(offset, false);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === 0x64617461 /* "data" */) {
      const bytesPerFrame = (bitsPerSample / 8) * numChannels;
      if (sampleRate <= 0 || bytesPerFrame <= 0) return NaN;
      return chunkSize / (sampleRate * bytesPerFrame);
    }
    offset += 8 + chunkSize;
  }
  return NaN;
}

export async function handler(req: Request, deps: DemoTranscribeDeps): Promise<Response> {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, { error: "method_not_allowed", message: "method not allowed" }, 405);

  const ip = deps.getClientIp(req);
  const ipHash = await sha256Hex(`${deps.pepper}:ip:${ip}`);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(req, { error: "bad_request", message: "invalid multipart body" }, 400);
  }

  const audio = form.get("audio");
  const deviceId = (form.get("device_id") as string | null) ?? "";
  const languageRaw = form.get("language");
  const language = typeof languageRaw === "string" && languageRaw.length > 0
    ? languageRaw.slice(0, 8)
    : null;

  if (!(audio instanceof Blob)) {
    return json(req, { error: "bad_request", message: "missing audio" }, 400);
  }
  if (audio.size === 0) {
    return json(req, { error: "bad_request", message: "empty audio" }, 400);
  }
  if (audio.size > 4_000_000) {
    return json(req, { error: "payload_too_large", message: "audio exceeds 4MB" }, 413);
  }
  if (!deviceId || deviceId.length < 8 || deviceId.length > 128) {
    return json(req, { error: "bad_request", message: "invalid device_id" }, 400);
  }

  const deviceIdHash = await sha256Hex(`${deps.pepper}:device:${deviceId}`);

  // Derive true duration from WAV header (don't trust client claim).
  const buf = new Uint8Array(await audio.arrayBuffer());
  const duration = wavDurationSeconds(buf);
  if (!Number.isFinite(duration) || duration <= 0) {
    await logAttempt(deps.client, {
      ip_hash: ipHash,
      device_id_hash: deviceIdHash,
      duration_seconds: null,
      success: false,
      error_code: "invalid_wav",
      text_length: null,
    });
    return json(req, { error: "bad_request", message: "invalid wav header" }, 400);
  }
  if (duration > MAX_DURATION_SECONDS) {
    await logAttempt(deps.client, {
      ip_hash: ipHash,
      device_id_hash: deviceIdHash,
      duration_seconds: duration,
      success: false,
      error_code: "duration_exceeded",
      text_length: null,
    });
    return json(
      req,
      {
        error: "duration_exceeded",
        message: `audio exceeds ${MAX_DURATION_SECONDS}s`,
        max_seconds: MAX_DURATION_SECONDS,
      },
      413,
    );
  }

  // Rate limit checks (use service role client; bypasses RLS).
  const since = new Date(deps.now().getTime() - IP_WINDOW_SECONDS * 1000).toISOString();
  const { count: ipCount, error: ipErr } = await deps.client
    .from("demo_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .eq("success", true)
    .gt("created_at", since);
  if (ipErr) {
    console.log(JSON.stringify({ event: "demo_transcribe_error", phase: "ip_count", message: ipErr.message }));
    return json(req, { error: "internal", message: "rate-limit query failed" }, 500);
  }
  if ((ipCount ?? 0) >= IP_MAX_SUCCESSES) {
    return json(
      req,
      { error: "rate_limited", scope: "ip", message: "ip quota exceeded" },
      429,
    );
  }

  const { count: deviceCount, error: deviceErr } = await deps.client
    .from("demo_attempts")
    .select("id", { count: "exact", head: true })
    .eq("device_id_hash", deviceIdHash)
    .eq("success", true);
  if (deviceErr) {
    console.log(JSON.stringify({ event: "demo_transcribe_error", phase: "device_count", message: deviceErr.message }));
    return json(req, { error: "internal", message: "rate-limit query failed" }, 500);
  }
  if ((deviceCount ?? 0) >= DEVICE_MAX_SUCCESSES_LIFETIME) {
    return json(
      req,
      { error: "rate_limited", scope: "device", message: "device quota exceeded" },
      429,
    );
  }

  // Call OpenAI Whisper.
  let text: string;
  try {
    const result = await deps.transcribe(audio, language);
    text = (result.text ?? "").trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({ event: "demo_transcribe_error", phase: "openai", message }));
    await logAttempt(deps.client, {
      ip_hash: ipHash,
      device_id_hash: deviceIdHash,
      duration_seconds: duration,
      success: false,
      error_code: "openai_failed",
      text_length: null,
    });
    return json(req, { error: "provider_unavailable", message: "transcription provider failed" }, 502);
  }

  await logAttempt(deps.client, {
    ip_hash: ipHash,
    device_id_hash: deviceIdHash,
    duration_seconds: duration,
    success: true,
    error_code: null,
    text_length: text.length,
  });

  return json(req, {
    text,
    duration_ms: Math.round(duration * 1000),
  });
}

async function logAttempt(client: SupabaseClient<any, any, any>, row: AttemptRow) {
  try {
    await client.from("demo_attempts").insert(row);
  } catch (err) {
    // Logging failures must not bubble up; abuse detection is best-effort.
    const message = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({ event: "demo_transcribe_log_error", message }));
  }
}

function realDeps(): DemoTranscribeDeps {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const pepper = Deno.env.get("DEMO_HASH_PEPPER");
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY_DEMO");
  if (!url || !key || !pepper || !openaiApiKey) {
    throw new Error(
      "demo-transcribe: missing required env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_HASH_PEPPER, OPENAI_API_KEY_DEMO)",
    );
  }
  const client: SupabaseClient = createClient(url, key);

  return {
    pepper,
    openaiApiKey,
    client,
    now: () => new Date(),
    getClientIp(req: Request): string {
      // Supabase Edge Runtime forwards client IP via x-forwarded-for.
      // We pick the FIRST entry (leftmost = original client).
      const xff = req.headers.get("x-forwarded-for");
      if (xff) return xff.split(",")[0].trim();
      const real = req.headers.get("x-real-ip");
      if (real) return real.trim();
      return "unknown";
    },
    async transcribe(wav: Blob, language: string | null): Promise<{ text: string }> {
      const fd = new FormData();
      fd.append("file", new File([wav], "audio.wav", { type: "audio/wav" }));
      fd.append("model", "whisper-1");
      fd.append("response_format", "json");
      if (language) fd.append("language", language);
      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiApiKey}` },
        body: fd,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`openai ${res.status}: ${body.slice(0, 200)}`);
      }
      const json = (await res.json()) as { text?: string };
      return { text: json.text ?? "" };
    },
  };
}

if (import.meta.main) {
  Deno.serve((req) => handler(req, realDeps()));
}
