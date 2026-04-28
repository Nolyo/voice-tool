import { describe, it, expect } from "vitest";
import {
  capHistoryPreservingPins,
  sortTranscriptions,
  type Transcription,
} from "./useTranscriptionHistory";

function tr(
  id: string,
  date: string,
  time: string,
  pinnedAt: string | null = null,
): Transcription {
  return { id, date, time, text: id, pinnedAt };
}

describe("sortTranscriptions", () => {
  it("places pinned rows before unpinned, regardless of date", () => {
    const items: Transcription[] = [
      tr("recent-unpinned", "2026-04-29", "12:00:00"),
      tr("old-pinned", "2026-01-01", "09:00:00", "2026-04-29T10:00:00.000Z"),
      tr("older-unpinned", "2026-04-28", "11:00:00"),
    ];
    const sorted = sortTranscriptions(items);
    expect(sorted.map((t) => t.id)).toEqual([
      "old-pinned",
      "recent-unpinned",
      "older-unpinned",
    ]);
  });

  it("orders multiple pinned rows by pinnedAt desc", () => {
    const items: Transcription[] = [
      tr("a", "2026-04-01", "10:00:00", "2026-04-29T10:00:00.000Z"),
      tr("b", "2026-04-02", "10:00:00", "2026-04-29T11:00:00.000Z"),
      tr("c", "2026-04-03", "10:00:00", "2026-04-29T09:00:00.000Z"),
    ];
    const sorted = sortTranscriptions(items);
    expect(sorted.map((t) => t.id)).toEqual(["b", "a", "c"]);
  });

  it("falls back to date+time desc for unpinned rows", () => {
    const items: Transcription[] = [
      tr("oldest", "2026-04-01", "10:00:00"),
      tr("newest", "2026-04-29", "23:59:00"),
      tr("middle", "2026-04-15", "12:00:00"),
    ];
    expect(sortTranscriptions(items).map((t) => t.id)).toEqual([
      "newest",
      "middle",
      "oldest",
    ]);
  });

  it("treats null pinnedAt the same as undefined", () => {
    const items: Transcription[] = [
      tr("nullish", "2026-04-29", "12:00:00", null),
      tr("missing", "2026-04-29", "12:00:01"),
    ];
    const sorted = sortTranscriptions(items);
    expect(sorted.map((t) => t.id)).toEqual(["missing", "nullish"]);
  });

  it("does not mutate the input array", () => {
    const items: Transcription[] = [
      tr("a", "2026-04-01", "10:00:00"),
      tr("b", "2026-04-02", "10:00:00", "2026-04-29T10:00:00.000Z"),
    ];
    const snapshot = items.map((t) => t.id);
    sortTranscriptions(items);
    expect(items.map((t) => t.id)).toEqual(snapshot);
  });

  it("breaks ties on identical pinnedAt by date+time desc", () => {
    const sameTs = "2026-04-29T10:00:00.000Z";
    const items: Transcription[] = [
      tr("older", "2026-04-01", "10:00:00", sameTs),
      tr("newer", "2026-04-02", "10:00:00", sameTs),
    ];
    expect(sortTranscriptions(items).map((t) => t.id)).toEqual([
      "newer",
      "older",
    ]);
  });
});

describe("capHistoryPreservingPins", () => {
  it("returns the input untouched when under the cap", () => {
    const items: Transcription[] = [
      tr("a", "2026-04-29", "10:00:00"),
      tr("b", "2026-04-28", "10:00:00"),
    ];
    expect(capHistoryPreservingPins(items, 5)).toBe(items);
  });

  it("trims oldest unpinned rows when above the cap", () => {
    const items: Transcription[] = [
      tr("new", "2026-04-29", "10:00:00"),
      tr("mid", "2026-04-28", "10:00:00"),
      tr("old", "2026-04-27", "10:00:00"),
      tr("ancient", "2026-04-26", "10:00:00"),
    ];
    const capped = capHistoryPreservingPins(items, 2);
    expect(capped.map((t) => t.id)).toEqual(["new", "mid"]);
  });

  it("never evicts pinned rows even when they overflow the cap", () => {
    const items: Transcription[] = [
      tr("p1", "2026-01-01", "10:00:00", "2026-04-29T10:00:00.000Z"),
      tr("p2", "2026-01-02", "10:00:00", "2026-04-29T11:00:00.000Z"),
      tr("p3", "2026-01-03", "10:00:00", "2026-04-29T12:00:00.000Z"),
      tr("recent", "2026-04-29", "10:00:00"),
      tr("oldish", "2026-04-28", "10:00:00"),
    ];
    // Cap = 2 but we have 3 pinned rows: pinned win, no unpinned survives.
    const capped = capHistoryPreservingPins(items, 2);
    expect(capped.map((t) => t.id).sort()).toEqual(["p1", "p2", "p3"]);
  });

  it("keeps all pins and as many recent unpinned as fit under the cap", () => {
    const items: Transcription[] = [
      tr("p1", "2026-01-01", "10:00:00", "2026-04-29T10:00:00.000Z"),
      tr("u-newest", "2026-04-29", "10:00:00"),
      tr("u-mid", "2026-04-28", "10:00:00"),
      tr("u-oldest", "2026-04-27", "10:00:00"),
    ];
    // Cap = 3 → keep p1 + 2 most recent unpinned.
    const capped = capHistoryPreservingPins(items, 3);
    expect(capped.map((t) => t.id)).toEqual(["p1", "u-newest", "u-mid"]);
  });

  it("with cap=0, drops every unpinned row but keeps pins", () => {
    const items: Transcription[] = [
      tr("u", "2026-04-29", "10:00:00"),
      tr("p", "2026-04-29", "10:00:00", "2026-04-29T10:00:00.000Z"),
    ];
    expect(
      capHistoryPreservingPins(items, 0).map((t) => t.id),
    ).toEqual(["p"]);
  });
});
