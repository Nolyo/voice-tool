import type { Env, AuthenticatedUser } from "./types";
import { transcribeWithGroq, GroqError } from "./groq";
import { checkQuotaForTranscription, recordUsageEvent, QuotaExhausted } from "./usage";
import { errorResponse } from "./errors";

const MAX_AUDIO_BYTES = 50 * 1024 * 1024; // 50 MB hard limit
const ALLOWED_MIME = new Set([
  "audio/wav", "audio/x-wav",
  "audio/mpeg", "audio/mp3",
  "audio/flac",
  "audio/mp4", "audio/m4a",
  "audio/ogg",
  "audio/webm",
]);

export async function handleTranscribe(
  req: Request,
  env: Env,
  user: AuthenticatedUser,
): Promise<Response> {
  const idempotencyKey = req.headers.get("Idempotency-Key") ?? undefined;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorResponse("internal", "expected multipart/form-data body");
  }

  const audio = form.get("audio");
  // FormDataEntryValue is `string | File | null` ; we want File (which extends Blob).
  if (audio === null || typeof audio === "string") {
    return errorResponse("internal", "missing 'audio' part");
  }
  const blob: Blob = audio;
  const language = form.get("language");
  const lang = typeof language === "string" ? language.slice(0, 2) : undefined;
  if (blob.size > MAX_AUDIO_BYTES) {
    return errorResponse("audio_too_large", `audio exceeds ${MAX_AUDIO_BYTES} bytes`);
  }
  if (blob.type && !ALLOWED_MIME.has(blob.type)) {
    return errorResponse("unsupported_format", `unsupported mime: ${blob.type}`);
  }

  let quota;
  try {
    quota = await checkQuotaForTranscription(env, user.user_id);
  } catch (err) {
    if (err instanceof QuotaExhausted) {
      return errorResponse("quota_exhausted", err.reason);
    }
    throw err;
  }

  let result;
  try {
    result = await transcribeWithGroq(blob, env, { language: lang, filename: "audio.wav" });
  } catch (err) {
    if (err instanceof GroqError) {
      return errorResponse("provider_unavailable", err.message);
    }
    throw err;
  }

  const minutes = result.duration / 60;
  const { event_id } = await recordUsageEvent(env, {
    user_id: user.user_id,
    kind: "transcription",
    units: minutes,
    units_unit: "minutes",
    model: "whisper-large-v3-turbo",
    provider: "groq",
    provider_request_id: result.request_id,
    idempotency_key: idempotencyKey,
    source: quota.source,
  });

  return Response.json({
    text: result.text,
    duration_ms: Math.round(result.duration * 1000),
    request_id: event_id,
    source: quota.source,
  });
}
