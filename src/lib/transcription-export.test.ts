import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildExportPayload } from "./transcription-export";
import type { Transcription } from "@/hooks/useTranscriptionHistory";

const sample: Transcription[] = [
  {
    id: "1",
    date: "2026-04-25",
    time: "10:30:00",
    text: "Hello, this is a test.",
    duration: 12,
    apiCost: 0.0012,
    transcriptionProvider: "OpenAI",
  },
  {
    id: "2",
    date: "2026-04-26",
    time: "14:15:00",
    text: "Another transcription with comma, and \"quotes\".",
    originalText: "Another transcription, raw.",
    postProcessMode: "auto",
  },
];

describe("buildExportPayload", () => {
  it("produces a .txt file with metadata when requested", () => {
    const out = buildExportPayload(sample, {
      format: "txt",
      includeMetadata: true,
      includeOriginal: true,
    });
    expect(out.filename).toMatch(/^lexena-export_.*\.txt$/);
    expect(out.mime).toBe("text/plain");
    expect(out.content).toContain("Hello, this is a test.");
    expect(out.content).toContain("OpenAI");
    expect(out.content).toContain("Another transcription, raw.");
  });

  it("strips metadata in TXT when includeMetadata is false", () => {
    const out = buildExportPayload(sample, {
      format: "txt",
      includeMetadata: false,
      includeOriginal: false,
    });
    expect(out.content).toContain("Hello, this is a test.");
    expect(out.content).not.toContain("OpenAI");
    expect(out.content).not.toContain("──");
  });

  it("renders Markdown with section headers", () => {
    const out = buildExportPayload(sample, {
      format: "md",
      includeMetadata: true,
      includeOriginal: true,
    });
    expect(out.filename).toMatch(/\.md$/);
    expect(out.content).toMatch(/^# Lexena/);
    expect(out.content).toContain("## ");
    expect(out.content).toContain("**Provider :** OpenAI");
  });

  it("produces valid JSON with full records when metadata is on", () => {
    const out = buildExportPayload(sample, {
      format: "json",
      includeMetadata: true,
      includeOriginal: true,
    });
    expect(out.filename).toMatch(/\.json$/);
    const parsed = JSON.parse(out.content);
    expect(parsed.count).toBe(2);
    expect(parsed.transcriptions).toHaveLength(2);
    expect(parsed.transcriptions[0].id).toBe("1");
    expect(parsed.transcriptions[0].apiCost).toBe(0.0012);
  });

  it("produces minimal JSON when metadata is off", () => {
    const out = buildExportPayload(sample, {
      format: "json",
      includeMetadata: false,
      includeOriginal: false,
    });
    const parsed = JSON.parse(out.content);
    expect(parsed.transcriptions[0]).toEqual({ text: "Hello, this is a test." });
  });

  it("escapes commas and quotes in CSV cells", () => {
    const out = buildExportPayload(sample, {
      format: "csv",
      includeMetadata: true,
      includeOriginal: false,
    });
    expect(out.filename).toMatch(/\.csv$/);
    const lines = out.content.trim().split("\n");
    expect(lines[0]).toMatch(/^date,time,text/);
    // Row 2 has a comma + quotes -> entire cell quoted, internal " doubled.
    expect(lines[2]).toContain('"Another transcription with comma, and ""quotes"".');
  });

  it("includes original column in CSV when requested", () => {
    const out = buildExportPayload(sample, {
      format: "csv",
      includeMetadata: false,
      includeOriginal: true,
    });
    const headers = out.content.split("\n")[0];
    expect(headers).toContain("originalText");
  });
});

describe("exportTranscriptions invoke", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("invokes the Tauri command with sanitized payload+filename", async () => {
    const invokeMock = vi.fn().mockResolvedValue("/Downloads/lexena-export_x.txt");
    vi.doMock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

    const mod = await import("./transcription-export");
    const result = await mod.exportTranscriptions(sample, {
      format: "txt",
      includeMetadata: true,
      includeOriginal: false,
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith(
      "export_transcriptions",
      expect.objectContaining({
        suggestedFilename: expect.stringMatching(/\.txt$/),
        payload: expect.stringContaining("Hello, this is a test."),
      }),
    );
    expect(result.path).toBe("/Downloads/lexena-export_x.txt");
    expect(result.filename).toMatch(/\.txt$/);
  });
});
