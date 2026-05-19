// deno-lint-ignore-file no-explicit-any
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handler, type DemoTranscribeDeps } from "./index.ts";

const ENDPOINT = "http://localhost/functions/v1/demo-transcribe";

interface CountQuery {
  table: string;
  filters: Record<string, unknown>;
  greaterThan?: { col: string; val: unknown };
  returnCount: number;
  error: unknown | null;
}

interface FakeClientOpts {
  ipCount?: number;
  deviceCount?: number;
  ipError?: unknown;
  deviceError?: unknown;
  insertError?: unknown;
}

function makeFakeClient(opts: FakeClientOpts = {}) {
  const inserts: Array<Record<string, unknown>> = [];
  const queries: CountQuery[] = [];
  let nthCountQuery = 0;

  const client: any = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserts.push({ table, ...row });
          return Promise.resolve({ error: opts.insertError ?? null });
        },
        select(_cols: string, _opts: any) {
          const filters: Record<string, unknown> = {};
          let greaterThan: { col: string; val: unknown } | undefined;
          const q: any = {
            eq(col: string, val: unknown) {
              filters[col] = val;
              return q;
            },
            gt(col: string, val: unknown) {
              greaterThan = { col, val };
              return q;
            },
            then(resolve: any, reject: any) {
              const isIpQuery = "ip_hash" in filters && !("device_id_hash" in filters);
              const isDeviceQuery = "device_id_hash" in filters && !("ip_hash" in filters);
              let count: number;
              let error: unknown = null;
              if (isIpQuery) {
                count = opts.ipCount ?? 0;
                error = opts.ipError ?? null;
              } else if (isDeviceQuery) {
                count = opts.deviceCount ?? 0;
                error = opts.deviceError ?? null;
              } else {
                count = 0;
              }
              queries.push({
                table,
                filters: { ...filters },
                greaterThan,
                returnCount: count,
                error,
              });
              nthCountQuery++;
              return Promise.resolve({ count, error }).then(resolve, reject);
            },
          };
          return q;
        },
      };
    },
  };

  return { client, inserts, queries };
}

/**
 * Build a minimal 16-bit PCM mono WAV with `samples` zero samples at `sampleRate`.
 * Used to test duration parsing without needing real audio.
 */
function makeWav(numSamples: number, sampleRate = 16000): Blob {
  const dataSize = numSamples * 2;
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
  return new Blob([buf], { type: "audio/wav" });
}

function makeForm(audio: Blob | null, deviceId: string | null, language?: string): FormData {
  const fd = new FormData();
  if (audio) fd.append("audio", new File([audio], "audio.wav", { type: "audio/wav" }));
  if (deviceId !== null) fd.append("device_id", deviceId);
  if (language) fd.append("language", language);
  return fd;
}

function baseDeps(overrides: Partial<DemoTranscribeDeps> = {}): DemoTranscribeDeps {
  return {
    pepper: "pepper",
    openaiApiKey: "sk-test",
    client: makeFakeClient().client,
    getClientIp: () => "1.2.3.4",
    transcribe: () => Promise.resolve({ text: "hello world" }),
    now: () => new Date("2026-05-18T10:00:00Z"),
    ...overrides,
  };
}

Deno.test("rejects non-POST", async () => {
  const res = await handler(new Request(ENDPOINT, { method: "GET" }), baseDeps());
  assertEquals(res.status, 405);
});

Deno.test("rejects missing audio", async () => {
  const body = makeForm(null, "dev-12345678");
  const res = await handler(
    new Request(ENDPOINT, { method: "POST", body }),
    baseDeps(),
  );
  assertEquals(res.status, 400);
  const json = await res.json();
  assertEquals(json.error, "bad_request");
});

Deno.test("rejects invalid device_id", async () => {
  const body = makeForm(makeWav(16000), "x"); // < 8 chars
  const res = await handler(
    new Request(ENDPOINT, { method: "POST", body }),
    baseDeps(),
  );
  assertEquals(res.status, 400);
});

Deno.test("rejects audio that exceeds 15s", async () => {
  // 16000 samples/sec * 16 sec = 256000 samples
  const body = makeForm(makeWav(16000 * 16), "dev-12345678");
  const fakeClient = makeFakeClient();
  const res = await handler(
    new Request(ENDPOINT, { method: "POST", body }),
    baseDeps({ client: fakeClient.client }),
  );
  assertEquals(res.status, 413);
  const json = await res.json();
  assertEquals(json.error, "duration_exceeded");
  // Failed attempt is logged.
  assertEquals(fakeClient.inserts.length, 1);
  assertEquals(fakeClient.inserts[0].success, false);
  assertEquals(fakeClient.inserts[0].error_code, "duration_exceeded");
});

Deno.test("returns 429 when IP quota exceeded", async () => {
  const body = makeForm(makeWav(16000 * 5), "dev-12345678");
  const fakeClient = makeFakeClient({ ipCount: 3 });
  const res = await handler(
    new Request(ENDPOINT, { method: "POST", body }),
    baseDeps({ client: fakeClient.client }),
  );
  assertEquals(res.status, 429);
  const json = await res.json();
  assertEquals(json.scope, "ip");
});

Deno.test("returns 429 when device quota exceeded", async () => {
  const body = makeForm(makeWav(16000 * 5), "dev-12345678");
  const fakeClient = makeFakeClient({ ipCount: 0, deviceCount: 2 });
  const res = await handler(
    new Request(ENDPOINT, { method: "POST", body }),
    baseDeps({ client: fakeClient.client }),
  );
  assertEquals(res.status, 429);
  const json = await res.json();
  assertEquals(json.scope, "device");
});

Deno.test("success path returns transcription + logs success", async () => {
  const body = makeForm(makeWav(16000 * 5), "dev-12345678", "fr");
  const fakeClient = makeFakeClient({ ipCount: 0, deviceCount: 0 });
  let receivedLang: string | null = null;
  const res = await handler(
    new Request(ENDPOINT, { method: "POST", body }),
    baseDeps({
      client: fakeClient.client,
      transcribe: (_wav, lang) => {
        receivedLang = lang;
        return Promise.resolve({ text: "bonjour le monde" });
      },
    }),
  );
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.text, "bonjour le monde");
  assertExists(json.duration_ms);
  assertEquals(receivedLang, "fr");
  assertEquals(fakeClient.inserts.length, 1);
  assertEquals(fakeClient.inserts[0].success, true);
  assertEquals(fakeClient.inserts[0].text_length, "bonjour le monde".length);
});

Deno.test("returns 502 when OpenAI fails + logs failure", async () => {
  const body = makeForm(makeWav(16000 * 5), "dev-12345678");
  const fakeClient = makeFakeClient({ ipCount: 0, deviceCount: 0 });
  const res = await handler(
    new Request(ENDPOINT, { method: "POST", body }),
    baseDeps({
      client: fakeClient.client,
      transcribe: () => Promise.reject(new Error("boom")),
    }),
  );
  assertEquals(res.status, 502);
  assertEquals(fakeClient.inserts.length, 1);
  assertEquals(fakeClient.inserts[0].success, false);
  assertEquals(fakeClient.inserts[0].error_code, "openai_failed");
});

Deno.test("rejects invalid WAV header", async () => {
  const garbage = new Blob([new Uint8Array(100)], { type: "audio/wav" });
  const body = makeForm(garbage, "dev-12345678");
  const fakeClient = makeFakeClient();
  const res = await handler(
    new Request(ENDPOINT, { method: "POST", body }),
    baseDeps({ client: fakeClient.client }),
  );
  assertEquals(res.status, 400);
  assertEquals(fakeClient.inserts.length, 1);
  assertEquals(fakeClient.inserts[0].error_code, "invalid_wav");
});
