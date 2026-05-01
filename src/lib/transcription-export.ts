import { invoke } from "@tauri-apps/api/core";
import type { Transcription } from "@/hooks/useTranscriptionHistory";

export type ExportFormat = "txt" | "md" | "json" | "csv";

export interface ExportOptions {
  format: ExportFormat;
  /** When true, include metadata (date, duration, cost, provider). */
  includeMetadata: boolean;
  /** When true and a transcription has a postProcessed text, include the original raw text. */
  includeOriginal: boolean;
}

function parseAt(t: Transcription): Date {
  const iso = `${t.date}T${t.time}`;
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) return d;
  return new Date(`${t.date} ${t.time}`);
}

function wordsOf(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function formatDuration(s?: number): string {
  if (!s || s <= 0) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildTxt(items: Transcription[], opts: ExportOptions): string {
  const lines: string[] = [];
  for (const t of items) {
    if (opts.includeMetadata) {
      const parts = [`${t.date} ${t.time}`];
      if (t.duration) parts.push(formatDuration(t.duration));
      if (t.transcriptionProvider) parts.push(t.transcriptionProvider);
      if (t.apiCost) parts.push(`$${t.apiCost.toFixed(4)}`);
      lines.push(`── ${parts.join(" · ")} ──`);
    }
    lines.push(t.text);
    if (opts.includeOriginal && t.originalText && t.originalText !== t.text) {
      lines.push("");
      lines.push("[Original (avant post-traitement)]");
      lines.push(t.originalText);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

function buildMarkdown(items: Transcription[], opts: ExportOptions): string {
  const lines: string[] = [];
  lines.push(`# Lexena — Export`);
  lines.push("");
  lines.push(`Exporté le ${new Date().toLocaleString()} · ${items.length} transcription(s)`);
  lines.push("");
  for (const t of items) {
    const at = parseAt(t);
    lines.push(`## ${at.toLocaleString()}`);
    if (opts.includeMetadata) {
      const meta: string[] = [];
      if (t.duration) meta.push(`**Durée :** ${formatDuration(t.duration)}`);
      meta.push(`**Mots :** ${wordsOf(t.text)}`);
      if (t.transcriptionProvider)
        meta.push(`**Provider :** ${t.transcriptionProvider}`);
      if (t.apiCost) meta.push(`**Coût :** $${t.apiCost.toFixed(4)}`);
      if (t.postProcessMode) meta.push(`**Post-process :** ${t.postProcessMode}`);
      if (meta.length) {
        lines.push("");
        lines.push(meta.join(" · "));
      }
    }
    lines.push("");
    lines.push(t.text);
    if (opts.includeOriginal && t.originalText && t.originalText !== t.text) {
      lines.push("");
      lines.push("> **Texte brut (avant post-traitement) :**");
      lines.push(">");
      for (const raw of t.originalText.split("\n")) {
        lines.push(`> ${raw}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

function buildJson(items: Transcription[], opts: ExportOptions): string {
  const stripped = items.map((t) => {
    if (opts.includeMetadata) return t;
    const { text, originalText } = t;
    return opts.includeOriginal && originalText && originalText !== text
      ? { text, originalText }
      : { text };
  });
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      count: items.length,
      transcriptions: stripped,
    },
    null,
    2,
  );
}

function buildCsv(items: Transcription[], opts: ExportOptions): string {
  const headers = ["date", "time", "text"];
  if (opts.includeMetadata) {
    headers.push("durationSec", "words", "provider", "apiCost", "postProcessMode");
  }
  if (opts.includeOriginal) {
    headers.push("originalText");
  }
  const rows = [headers.join(",")];
  for (const t of items) {
    const cells: string[] = [t.date, t.time, escapeCsvCell(t.text)];
    if (opts.includeMetadata) {
      cells.push(
        t.duration ? String(Math.round(t.duration)) : "",
        String(wordsOf(t.text)),
        escapeCsvCell(t.transcriptionProvider ?? ""),
        t.apiCost ? t.apiCost.toFixed(4) : "",
        escapeCsvCell(t.postProcessMode ?? ""),
      );
    }
    if (opts.includeOriginal) {
      cells.push(escapeCsvCell(t.originalText ?? ""));
    }
    rows.push(cells.join(","));
  }
  return rows.join("\n") + "\n";
}

export function buildExportPayload(
  items: Transcription[],
  opts: ExportOptions,
): { content: string; filename: string; mime: string } {
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const base = `lexena-export_${stamp}`;
  switch (opts.format) {
    case "txt":
      return {
        content: buildTxt(items, opts),
        filename: `${base}.txt`,
        mime: "text/plain",
      };
    case "md":
      return {
        content: buildMarkdown(items, opts),
        filename: `${base}.md`,
        mime: "text/markdown",
      };
    case "json":
      return {
        content: buildJson(items, opts),
        filename: `${base}.json`,
        mime: "application/json",
      };
    case "csv":
      return {
        content: buildCsv(items, opts),
        filename: `${base}.csv`,
        mime: "text/csv",
      };
  }
}

/** Save export to OS Downloads folder via Tauri command. Returns absolute path. */
export async function exportTranscriptions(
  items: Transcription[],
  opts: ExportOptions,
): Promise<{ path: string; filename: string }> {
  const { content, filename } = buildExportPayload(items, opts);
  const path = await invoke<string>("export_transcriptions", {
    payload: content,
    suggestedFilename: filename,
  });
  return { path, filename };
}
