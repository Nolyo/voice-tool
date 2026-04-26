import { describe, it, expect } from "vitest";
import {
  EMPTY_ADV_FILTERS,
  applyAdvFilters,
  countActiveAdvFilters,
  isAdvFiltersActive,
  type AdvancedFilters,
} from "./AdvancedFiltersPopover";
import type { Transcription } from "@/hooks/useTranscriptionHistory";

const items: Transcription[] = [
  {
    id: "a",
    date: "2026-04-20",
    time: "10:00:00",
    text: "alpha",
    duration: 5,
    apiCost: 0.01,
    transcriptionProvider: "OpenAI",
  },
  {
    id: "b",
    date: "2026-04-22",
    time: "11:00:00",
    text: "bravo",
    duration: 30,
    transcriptionProvider: "Local",
    originalText: "raw bravo",
  },
  {
    id: "c",
    date: "2026-04-25",
    time: "12:00:00",
    text: "charlie",
    duration: 60,
    apiCost: 0.05,
    transcriptionProvider: "Groq",
  },
];

describe("AdvancedFilters helpers", () => {
  it("treats empty filters as inactive", () => {
    expect(isAdvFiltersActive(EMPTY_ADV_FILTERS)).toBe(false);
    expect(countActiveAdvFilters(EMPTY_ADV_FILTERS)).toBe(0);
    expect(applyAdvFilters(items, EMPTY_ADV_FILTERS)).toEqual(items);
  });

  it("counts each active facet once", () => {
    const f: AdvancedFilters = {
      ...EMPTY_ADV_FILTERS,
      dateFrom: "2026-04-21",
      source: "api",
      provider: "OpenAI",
      minDurationSec: 10,
      withCostOnly: true,
      postProcessedOnly: true,
    };
    expect(countActiveAdvFilters(f)).toBe(6);
    expect(isAdvFiltersActive(f)).toBe(true);
  });

  it("filters by date range (inclusive)", () => {
    const result = applyAdvFilters(items, {
      ...EMPTY_ADV_FILTERS,
      dateFrom: "2026-04-22",
      dateTo: "2026-04-25",
    });
    expect(result.map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("filters by source api/local", () => {
    const api = applyAdvFilters(items, {
      ...EMPTY_ADV_FILTERS,
      source: "api",
    });
    expect(api.map((i) => i.id)).toEqual(["a", "c"]);

    const local = applyAdvFilters(items, {
      ...EMPTY_ADV_FILTERS,
      source: "local",
    });
    expect(local.map((i) => i.id)).toEqual(["b"]);
  });

  it("filters by provider name", () => {
    const result = applyAdvFilters(items, {
      ...EMPTY_ADV_FILTERS,
      provider: "Groq",
    });
    expect(result.map((i) => i.id)).toEqual(["c"]);
  });

  it("filters by minimum duration", () => {
    const result = applyAdvFilters(items, {
      ...EMPTY_ADV_FILTERS,
      minDurationSec: 30,
    });
    expect(result.map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("filters by post-processed only", () => {
    const result = applyAdvFilters(items, {
      ...EMPTY_ADV_FILTERS,
      postProcessedOnly: true,
    });
    expect(result.map((i) => i.id)).toEqual(["b"]);
  });

  it("filters by with-cost only", () => {
    const result = applyAdvFilters(items, {
      ...EMPTY_ADV_FILTERS,
      withCostOnly: true,
    });
    expect(result.map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("combines facets with AND semantics", () => {
    const result = applyAdvFilters(items, {
      ...EMPTY_ADV_FILTERS,
      source: "api",
      minDurationSec: 30,
    });
    expect(result.map((i) => i.id)).toEqual(["c"]);
  });
});
