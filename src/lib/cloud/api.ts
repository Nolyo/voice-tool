import { invoke } from "@tauri-apps/api/core";
import type {
  TranscriptionResult,
  PostProcessResult,
  PostProcessTask,
  ModelTier,
  NotesAssistResult,
} from "./types";
import { CloudApiError } from "./errors";

export interface TranscribeArgs {
  samples: Int16Array;
  sampleRate: number;
  language?: string;
  jwt: string;
  idempotencyKey?: string;
}

export interface PostProcessArgs {
  task: PostProcessTask;
  text: string;
  language?: string;
  modelTier?: ModelTier;
  jwt: string;
  idempotencyKey?: string;
}

export interface NotesAssistArgs {
  systemPrompt: string;
  userText: string;
  modelTier?: ModelTier;
  jwt: string;
  idempotencyKey?: string;
}

async function invokeWithErrorMapping<T>(
  cmd: string,
  payload: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(cmd, payload);
  } catch (err) {
    throw CloudApiError.fromTauri(err);
  }
}

async function withNetworkRetry<T>(
  fn: () => Promise<T>,
  attempts = 2,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (err instanceof CloudApiError) throw err;
      if (i === attempts) throw err;
      await new Promise((r) => setTimeout(r, 200 * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

export async function transcribeCloud(args: TranscribeArgs): Promise<TranscriptionResult> {
  const idempotencyKey = args.idempotencyKey ?? crypto.randomUUID();
  return withNetworkRetry(() =>
    invokeWithErrorMapping<TranscriptionResult>("transcribe_audio_cloud", {
      samples: Array.from(args.samples),
      sampleRate: args.sampleRate,
      language: args.language ?? null,
      jwt: args.jwt,
      idempotencyKey,
    }),
  );
}

export async function postProcessCloud(args: PostProcessArgs): Promise<PostProcessResult> {
  const idempotencyKey = args.idempotencyKey ?? crypto.randomUUID();
  return withNetworkRetry(() =>
    invokeWithErrorMapping<PostProcessResult>("post_process_cloud", {
      task: args.task,
      text: args.text,
      language: args.language ?? null,
      modelTier: args.modelTier ?? null,
      jwt: args.jwt,
      idempotencyKey,
    }),
  );
}

export async function notesAssistCloud(args: NotesAssistArgs): Promise<NotesAssistResult> {
  const idempotencyKey = args.idempotencyKey ?? crypto.randomUUID();
  return withNetworkRetry(() =>
    invokeWithErrorMapping<NotesAssistResult>("notes_assist_cloud", {
      systemPrompt: args.systemPrompt,
      userText: args.userText,
      modelTier: args.modelTier ?? null,
      jwt: args.jwt,
      idempotencyKey,
    }),
  );
}
