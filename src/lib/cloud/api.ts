import { invoke } from "@tauri-apps/api/core";
import type {
  TranscriptionResult,
  PostProcessResult,
  PostProcessTask,
  ModelTier,
} from "./types";
import { CloudApiError } from "./errors";

export interface TranscribeArgs {
  samples: Int16Array;
  sampleRate: number;
  language?: string;
  jwt: string;
  idempotencyKey?: string;
}

export async function transcribeCloud(args: TranscribeArgs): Promise<TranscriptionResult> {
  try {
    return await invoke<TranscriptionResult>("transcribe_audio_cloud", {
      samples: Array.from(args.samples),
      sampleRate: args.sampleRate,
      language: args.language ?? null,
      jwt: args.jwt,
      idempotencyKey: args.idempotencyKey ?? null,
    });
  } catch (err) {
    throw CloudApiError.fromTauri(err);
  }
}

export interface PostProcessArgs {
  task: PostProcessTask;
  text: string;
  language?: string;
  modelTier?: ModelTier;
  jwt: string;
  idempotencyKey?: string;
}

export async function postProcessCloud(args: PostProcessArgs): Promise<PostProcessResult> {
  try {
    return await invoke<PostProcessResult>("post_process_cloud", {
      task: args.task,
      text: args.text,
      language: args.language ?? null,
      modelTier: args.modelTier ?? null,
      jwt: args.jwt,
      idempotencyKey: args.idempotencyKey ?? null,
    });
  } catch (err) {
    throw CloudApiError.fromTauri(err);
  }
}
