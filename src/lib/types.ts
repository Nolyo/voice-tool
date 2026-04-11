/**
 * Shared types used across features.
 *
 * Populated incrementally during the frontend refactor. As of Phase 3 it
 * holds the two shapes returned by Rust commands that Dashboard used to
 * declare inline.
 */

/** Result shape returned by the `transcribe_audio` Tauri command. */
export type TranscriptionInvokeResult = {
  text: string;
  audioPath: string;
};

/** Result shape returned by the `stop_recording` Tauri command. */
export type RecordingResult = {
  audio_data: number[];
  sample_rate: number;
  avg_rms: number;
  is_silent: boolean;
};
