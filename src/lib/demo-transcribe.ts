const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const ENDPOINT = `${SUPABASE_URL}/functions/v1/demo-transcribe`;

export type DemoErrorKind =
  | "rate_limited"
  | "duration_exceeded"
  | "bad_request"
  | "network"
  | "provider_unavailable"
  | "unknown";

export interface DemoResult {
  text: string;
  duration_ms: number;
}

export class DemoTranscribeError extends Error {
  constructor(
    public readonly kind: DemoErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "DemoTranscribeError";
  }
}

/**
 * Encode mono 16-bit PCM samples as a minimal RIFF/WAVE blob.
 *
 * The server re-derives duration from this same header, so anything we send
 * must round-trip cleanly. Keep this 44-byte canonical layout.
 */
export function encodeWav(samples: Int16Array, sampleRate: number): Blob {
  const dataSize = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  // RIFF header
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  // fmt chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  // data chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true);
  // PCM data
  const pcm = new DataView(buf, 44);
  for (let i = 0; i < samples.length; i++) {
    pcm.setInt16(i * 2, samples[i], true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

export interface SubmitDemoArgs {
  samples: Int16Array;
  sampleRate: number;
  deviceId: string;
  language?: string;
  /** Override endpoint for tests. */
  endpoint?: string;
  /** Override fetch for tests. */
  fetchImpl?: typeof fetch;
}

export async function submitDemoTranscription(args: SubmitDemoArgs): Promise<DemoResult> {
  const wav = encodeWav(args.samples, args.sampleRate);
  const form = new FormData();
  form.append("audio", new File([wav], "audio.wav", { type: "audio/wav" }));
  form.append("device_id", args.deviceId);
  if (args.language) form.append("language", args.language);

  const url = args.endpoint ?? ENDPOINT;
  const f = args.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await f(url, {
      method: "POST",
      headers: {
        // Supabase Edge Functions require the apikey header even for "anon" use.
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: form,
    });
  } catch (err) {
    throw new DemoTranscribeError("network", err instanceof Error ? err.message : String(err));
  }

  if (res.ok) {
    const json = (await res.json()) as DemoResult;
    return json;
  }

  let kind: DemoErrorKind = "unknown";
  let message = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    if (body.error) {
      message = body.message ?? body.error;
      switch (body.error) {
        case "rate_limited":
          kind = "rate_limited";
          break;
        case "duration_exceeded":
        case "payload_too_large":
          kind = "duration_exceeded";
          break;
        case "bad_request":
          kind = "bad_request";
          break;
        case "provider_unavailable":
          kind = "provider_unavailable";
          break;
        default:
          kind = "unknown";
      }
    }
  } catch {
    // Body wasn't JSON; fall through with default kind/message.
  }
  throw new DemoTranscribeError(kind, message, res.status);
}

