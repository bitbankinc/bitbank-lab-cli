import { describe, expect, it } from "vitest";
import type { Candle } from "../../commands/public/candles-fetch.js";
import {
  augmentMeta,
  detectGaps,
  detectLastIncomplete,
  normalizeCandles,
} from "../../commands/public/candles-merge.js";

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

  it("ignores fractional delta that does not span a full step", () => {
    // delta = 1.5 * step (1min) → 整数の欠損本数にならないので gap として扱わない
    expect(detectGaps([c(0), c(90_000)], "1min")).toEqual([]);
  });

  it("floors fractional delta when missing >= 1", () => {
    // delta = 2.5 * step (1min) → missing = floor(2.5) - 1 = 1
    const gaps = detectGaps([c(0), c(150_000)], "1min");
    expect(gaps).toEqual([{ from: 0, to: 150_000, missing: 1 }]);
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

  it("adds lastIsIncomplete only when true", () => {
    expect(augmentMeta(0, [], undefined, true)).toEqual({ lastIsIncomplete: true });
    expect(augmentMeta(0, [], undefined, false)).toBeUndefined();
    expect(augmentMeta(0, [], undefined, undefined)).toBeUndefined();
  });

  it("merges lastIsIncomplete with baseMeta and other flags", () => {
    expect(augmentMeta(2, [], { truncated: true, reason: "HARD_MAX_SEGMENTS" }, true)).toEqual({
      truncated: true,
      reason: "HARD_MAX_SEGMENTS",
      dedupedCount: 2,
      lastIsIncomplete: true,
    });
  });
});

describe("detectLastIncomplete", () => {
  it("returns false for empty input", () => {
    expect(detectLastIncomplete([], "1hour")).toBe(false);
  });

  it("returns true when next boundary is after now (1hour)", () => {
    // last timestamp = 12:00, now = 12:30 → period 12:00〜13:00 incomplete
    const now = Date.UTC(2026, 0, 1, 12, 30);
    const last = Date.UTC(2026, 0, 1, 12, 0);
    expect(detectLastIncomplete([c(last)], "1hour", now)).toBe(true);
  });

  it("returns false when last period has ended (1hour)", () => {
    // last timestamp = 11:00, now = 12:30 → period 11:00〜12:00 already complete
    const now = Date.UTC(2026, 0, 1, 12, 30);
    const last = Date.UTC(2026, 0, 1, 11, 0);
    expect(detectLastIncomplete([c(last)], "1hour", now)).toBe(false);
  });

  it("returns false at the exact boundary (1hour)", () => {
    // end > now なので等値時は false（period 終端 = 現在時刻 → 終了済み扱い）
    const last = Date.UTC(2026, 0, 1, 12, 0);
    const now = last + 3_600_000;
    expect(detectLastIncomplete([c(last)], "1hour", now)).toBe(false);
  });

  it("works for 1min", () => {
    const last = Date.UTC(2026, 0, 1, 12, 0);
    expect(detectLastIncomplete([c(last)], "1min", last + 30_000)).toBe(true);
    expect(detectLastIncomplete([c(last)], "1min", last + 60_000)).toBe(false);
  });

  it("works for 1day in JST", () => {
    // last = 2026-01-01 00:00 JST, now = 2026-01-01 12:00 JST → 日中なので未確定
    const last = Date.UTC(2026, 0, 1) - 32_400_000;
    const now = last + 12 * 3_600_000;
    expect(detectLastIncomplete([c(last)], "1day", now)).toBe(true);
    // now = 2026-01-02 00:00 JST → 確定済み
    expect(detectLastIncomplete([c(last)], "1day", last + 86_400_000)).toBe(false);
  });

  it("works for 1month (JST 翌月 1 日 00:00 で判定)", () => {
    // last = 2026-01-01 00:00 JST (January candle)
    const last = Date.UTC(2026, 0, 1) - 32_400_000;
    // now = 2026-01-15 → January はまだ未確定
    expect(detectLastIncomplete([c(last)], "1month", last + 14 * 86_400_000)).toBe(true);
    // now = 2026-02-01 00:00 JST → January 完了
    const feb1 = Date.UTC(2026, 1, 1) - 32_400_000;
    expect(detectLastIncomplete([c(last)], "1month", feb1)).toBe(false);
    // now = 2026-01-31 23:59 JST → まだ未確定
    expect(detectLastIncomplete([c(last)], "1month", feb1 - 60_000)).toBe(true);
  });

  it("handles December → January rollover for 1month", () => {
    const last = Date.UTC(2026, 11, 1) - 32_400_000;
    const jan1 = Date.UTC(2027, 0, 1) - 32_400_000;
    expect(detectLastIncomplete([c(last)], "1month", jan1 - 60_000)).toBe(true);
    expect(detectLastIncomplete([c(last)], "1month", jan1)).toBe(false);
  });

  it("uses the LAST row's timestamp (not first)", () => {
    const now = Date.UTC(2026, 0, 1, 12, 30);
    const first = Date.UTC(2026, 0, 1, 0, 0); // far past
    const last = Date.UTC(2026, 0, 1, 12, 0); // current hour
    expect(detectLastIncomplete([c(first), c(last)], "1hour", now)).toBe(true);
  });

  it("returns false for unknown type", () => {
    expect(detectLastIncomplete([c(1000)], "bogus", 2000)).toBe(false);
  });
});
