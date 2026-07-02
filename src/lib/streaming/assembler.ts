/**
 * Ordered assembly of per-chunk transcripts for a streaming session.
 *
 * Chunks are uploaded sequentially but this stays defensive: results are
 * keyed by chunk index and joined in order, so an out-of-order or missing
 * result can never scramble the final text. Failed chunks leave a gap (the
 * caller warns the user) but never block assembly.
 */
export class TranscriptAssembler {
  private texts = new Map<number, string>();
  private failed = new Set<number>();

  upsert(index: number, text: string): void {
    this.failed.delete(index);
    this.texts.set(index, text);
  }

  markFailed(index: number): void {
    this.texts.delete(index);
    this.failed.add(index);
  }

  /** Ordered join of every non-empty chunk text, single-spaced and trimmed. */
  assembled(): string {
    const indexes = [...this.texts.keys()].sort((a, b) => a - b);
    return indexes
      .map((i) => (this.texts.get(i) ?? "").trim())
      .filter((t) => t.length > 0)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  get okCount(): number {
    return this.texts.size;
  }

  get failedCount(): number {
    return this.failed.size;
  }
}
