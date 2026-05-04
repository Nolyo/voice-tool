import type { Env } from "./types";

const GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const DEFAULT_MODEL = "whisper-large-v3-turbo";

export interface GroqTranscriptionResult {
  text: string;
  duration: number; // seconds, as returned by Groq
  request_id?: string;
}

export class GroqError extends Error {
  constructor(message: string, public status: number, public retryable: boolean) {
    super(message);
    this.name = "GroqError";
  }
}

export async function transcribeWithGroq(
  audioBlob: Blob,
  env: Env,
  opts: { language?: string; filename?: string } = {},
): Promise<GroqTranscriptionResult> {
  const form = new FormData();
  form.append("file", audioBlob, opts.filename ?? "audio.bin");
  form.append("model", DEFAULT_MODEL);
  form.append("response_format", "verbose_json");
  if (opts.language) {
    form.append("language", opts.language);
  }

  const res = await fetch(GROQ_TRANSCRIBE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: form,
  });

  const requestId = res.headers.get("x-request-id") ?? undefined;

  if (!res.ok) {
    const text = await res.text().catch(() => "<no body>");
    const retryable = res.status >= 500 || res.status === 429;
    throw new GroqError(
      `groq returned ${res.status}: ${text.slice(0, 256)}`,
      res.status,
      retryable,
    );
  }

  const json = (await res.json()) as { text?: string; duration?: number };
  if (typeof json.text !== "string" || typeof json.duration !== "number") {
    throw new GroqError("malformed groq response", 502, true);
  }

  return {
    text: json.text,
    duration: json.duration,
    request_id: requestId,
  };
}
