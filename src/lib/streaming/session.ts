import { CloudApiError } from "@/lib/cloud/errors";
import { TranscriptAssembler } from "./assembler";

/** Payload of the Rust `streaming-chunk` event (camelCase, see streaming.rs). */
export interface StreamingChunkPayload {
  sessionId: number;
  chunkIndex: number;
  samples: number[];
  sampleRate: number;
  startMs: number;
  endMs: number;
}

/** Uploads one chunk and returns its transcript. Injected for testability —
 *  production wires `transcribeCloud` here (which already retries transient
 *  network errors internally). */
export type ChunkTransport = (
  chunk: StreamingChunkPayload,
  jwt: string,
  language?: string,
) => Promise<{ text: string; duration_ms: number }>;

export type FatalReason = "quota" | "auth" | "network";

export interface StreamingOutcome {
  text: string;
  billedMs: number;
  chunksOk: number;
  chunksFailed: number;
  aborted: boolean;
}

export interface StreamingSessionOptions {
  sessionId: number;
  language?: string;
  getJwt: () => Promise<string | undefined>;
  transport: ChunkTransport;
  /** Called after each successful chunk with the full assembled text so far. */
  onTranscript: (assembledText: string) => void;
  /** A fatal error aborts the session; the caller stops the recording. */
  onFatal: (reason: FatalReason, error: unknown) => void;
  /** Consecutive non-fatal failures tolerated before aborting. Default 2. */
  maxConsecutiveFailures?: number;
}

/**
 * Sequential upload pump for one streaming session: chunks are transcribed
 * one at a time, in order (this also throttles the request rate towards the
 * worker). Quota/auth errors are fatal immediately; other errors skip the
 * chunk and only become fatal after `maxConsecutiveFailures` in a row.
 */
export class StreamingUploadSession {
  private readonly opts: StreamingSessionOptions;
  private readonly assembler = new TranscriptAssembler();
  private readonly maxConsecutiveFailures: number;

  private pump: Promise<void> = Promise.resolve();
  private billedMs = 0;
  private consecutiveFailures = 0;
  private aborted = false;
  private fatalSignaled = false;

  constructor(opts: StreamingSessionOptions) {
    this.opts = opts;
    this.maxConsecutiveFailures = opts.maxConsecutiveFailures ?? 2;
  }

  get active(): boolean {
    return !this.aborted;
  }

  enqueue(chunk: StreamingChunkPayload): void {
    if (this.aborted) return;
    this.pump = this.pump.then(() => this.processChunk(chunk));
  }

  /** Resolves once every enqueued chunk has been processed (or dropped). */
  async finish(): Promise<StreamingOutcome> {
    await this.pump;
    return {
      text: this.assembler.assembled(),
      billedMs: this.billedMs,
      chunksOk: this.assembler.okCount,
      chunksFailed: this.assembler.failedCount,
      aborted: this.aborted,
    };
  }

  /** Drop all pending work; in-flight upload finishes but is discarded. */
  abort(): void {
    this.aborted = true;
  }

  private fatal(reason: FatalReason, error: unknown): void {
    this.abort();
    if (!this.fatalSignaled) {
      this.fatalSignaled = true;
      this.opts.onFatal(reason, error);
    }
  }

  private async processChunk(chunk: StreamingChunkPayload): Promise<void> {
    if (this.aborted) return;

    const jwt = await this.opts.getJwt();
    if (!jwt) {
      this.fatal("auth", new Error("no active session JWT"));
      return;
    }

    try {
      const result = await this.opts.transport(chunk, jwt, this.opts.language);
      if (this.aborted) return;
      this.assembler.upsert(chunk.chunkIndex, result.text);
      this.billedMs += result.duration_ms;
      this.consecutiveFailures = 0;
      this.opts.onTranscript(this.assembler.assembled());
    } catch (error) {
      if (this.aborted) return;
      if (error instanceof CloudApiError && error.isQuotaIssue()) {
        this.fatal("quota", error);
        return;
      }
      if (error instanceof CloudApiError && error.isAuthIssue()) {
        this.fatal("auth", error);
        return;
      }
      this.assembler.markFailed(chunk.chunkIndex);
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures > this.maxConsecutiveFailures) {
        this.fatal("network", error);
      }
    }
  }
}
