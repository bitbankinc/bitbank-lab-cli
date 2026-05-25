import { describe, expect, it } from "vitest";
import type { Candle } from "../../commands/public/candles-fetch.js";
import { augmentMeta, detectGaps, normalizeCandles } from "../../commands/public/candles-merge.js";

const c = (timestamp: number): Candle => ({
  open: 1,
  high: 1,
  low: 1,
  close: 1,
  vol: 1,
  timestamp,
});

describe("normalizeCandles", () => {
  it("returns empty input as-is with dedupedCount 0", () => {
    const { rows, dedupedCount } = normalizeCandles([]);
    expect(rows).toEqual([]);
    expect(dedupedCount).toBe(0);
  });

  it("sorts unordered input by timestamp ascending", () => {
    const input = [c(3000), c(1000), c(2000)];
    const { rows, dedupedCount } = normalizeCandles(input);
    expect(rows.map((r) => r.timestamp)).toEqual([1000, 2000, 3000]);
    expect(dedupedCount).toBe(0);
  });

  it("does not mutate the input array", () => {
    const input = [c(3000), c(1000), c(2000)];
    normalizeCandles(input);
    expect(input.map((r) => r.timestamp)).toEqual([3000, 1000, 2000]);
  });

  it("collapses duplicate timestamps and counts them", () => {
    const input = [c(1000), c(2000), c(1000), c(3000), c(2000)];
    const { rows, dedupedCount } = normalizeCandles(input);
    expect(rows.map((r) => r.timestamp)).toEqual([1000, 2000, 3000]);
    expect(dedupedCount).toBe(2);
  });

  it("keeps a single row unchanged", () => {
    const { rows, dedupedCount } = normalizeCandles([c(1000)]);
    expect(rows).toHaveLength(1);
    expect(dedupedCount).toBe(0);
  });
});

describe("detectGaps", () => {
  it("returns empty array for empty or single-row input", () => {
    expect(detectGaps([], "1min")).toEqual([]);
    expect(detectGaps([c(1000)], "1min")).toEqual([]);
  });

  it("returns empty when sub-daily rows are contiguous", () => {
    const rows = [c(0), c(60_000), c(120_000)];
    expect(detectGaps(rows, "1min")).toEqual([]);
  });

  it("detects a 1-row gap in 1min series", () => {
    const rows = [c(0), c(60_000), c(180_000)];
    const gaps = detectGaps(rows, "1min");
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toEqual({ from: 60_000, to: 180_000, missing: 1 });
  });

  it("detects multiple gaps and reports missing counts", () => {
    const rows = [c(0), c(60_000), c(300_000), c(360_000), c(540_000)];
    const gaps = detectGaps(rows, "1min");
    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toEqual({ from: 60_000, to: 300_000, missing: 3 });
    expect(gaps[1]).toEqual({ from: 360_000, to: 540_000, missing: 2 });
  });

  it("works for 5min / 15min / 30min / 1hour steps", () => {
    expect(detectGaps([c(0), c(900_000)], "5min")).toEqual([{ from: 0, to: 900_000, missing: 2 }]);
    expect(detectGaps([c(0), c(1_800_000)], "15min")).toEqual([
      { from: 0, to: 1_800_000, missing: 1 },
    ]);
    expect(detectGaps([c(0), c(3_600_000)], "30min")).toEqual([
      { from: 0, to: 3_600_000, missing: 1 },
    ]);
    expect(detectGaps([c(0), c(7_200_000)], "1hour")).toEqual([
      { from: 0, to: 7_200_000, missing: 1 },
    ]);
  });

  it("returns empty for yearly types (暦依存なので step を持たない)", () => {
    const rows = [c(0), c(86_400_000), c(86_400_000 * 5)];
    expect(detectGaps(rows, "1day")).toEqual([]);
    expect(detectGaps(rows, "4hour")).toEqual([]);
    expect(detectGaps(rows, "8hour")).toEqual([]);
    expect(detectGaps(rows, "12hour")).toEqual([]);
    expect(detectGaps(rows, "1week")).toEqual([]);
    expect(detectGaps(rows, "1month")).toEqual([]);
  });

  it("returns empty for unknown types", () => {
    expect(detectGaps([c(0), c(1_000_000)], "bogus")).toEqual([]);
  });
});

describe("augmentMeta", () => {
  it("returns baseMeta unchanged when no dedupes or gaps", () => {
    expect(augmentMeta(0, [])).toBeUndefined();
    expect(augmentMeta(0, [], { truncated: true, reason: "MAX_RANGE_FETCHES" })).toEqual({
      truncated: true,
      reason: "MAX_RANGE_FETCHES",
    });
  });

  it("adds dedupedCount when > 0", () => {
    expect(augmentMeta(3, [])).toEqual({ dedupedCount: 3 });
  });

  it("adds gaps when non-empty", () => {
    const gaps = [{ from: 0, to: 120_000, missing: 1 }];
    expect(augmentMeta(0, gaps)).toEqual({ gaps });
  });

  it("merges with baseMeta without overwriting existing fields", () => {
    const gaps = [{ from: 0, to: 120_000, missing: 1 }];
    expect(
      augmentMeta(2, gaps, { truncated: true, reason: "HARD_MAX_SEGMENTS", requestedLimit: 1000 }),
    ).toEqual({
      truncated: true,
      reason: "HARD_MAX_SEGMENTS",
      requestedLimit: 1000,
      dedupedCount: 2,
      gaps,
    });
  });
});
