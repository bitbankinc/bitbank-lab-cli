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

  it("detects gaps for 4hour (固定 4h step)", () => {
    // 0 → 24h: 6 boundaries (4h,8h,12h,16h,20h,24h), curr に到達するのは 5 本欠損
    expect(detectGaps([c(0), c(86_400_000)], "4hour")).toEqual([
      { from: 0, to: 86_400_000, missing: 5 },
    ]);
    expect(detectGaps([c(0), c(14_400_000)], "4hour")).toEqual([]);
  });

  it("detects gaps for 8hour / 12hour (固定 step)", () => {
    expect(detectGaps([c(0), c(86_400_000)], "8hour")).toEqual([
      { from: 0, to: 86_400_000, missing: 2 },
    ]);
    expect(detectGaps([c(0), c(86_400_000)], "12hour")).toEqual([
      { from: 0, to: 86_400_000, missing: 1 },
    ]);
  });

  it("detects gaps for 1day (UTC 日境界)", () => {
    // Jan 1 と Jan 3 (UTC 00:00) で Jan 2 が欠損
    const jan1 = Date.UTC(2024, 0, 1);
    const jan3 = Date.UTC(2024, 0, 3);
    expect(detectGaps([c(jan1), c(jan3)], "1day")).toEqual([{ from: jan1, to: jan3, missing: 1 }]);
  });

  it("detects gaps for 1week (固定 7 日 step)", () => {
    // 0 → 21日 で 7日・14日が欠損 (missing=2)
    expect(detectGaps([c(0), c(7 * 86_400_000)], "1week")).toEqual([]);
    expect(detectGaps([c(0), c(21 * 86_400_000)], "1week")).toEqual([
      { from: 0, to: 21 * 86_400_000, missing: 2 },
    ]);
  });

  it("detects gaps for 1month (暦依存・閏年含む, UTC 月初)", () => {
    // Jan 1 と April 1 で Feb 1・Mar 1 が欠損 (missing=2)
    const jan1 = Date.UTC(2024, 0, 1);
    const apr1 = Date.UTC(2024, 3, 1);
    expect(detectGaps([c(jan1), c(apr1)], "1month")).toEqual([
      { from: jan1, to: apr1, missing: 2 },
    ]);
    // 隣接月（Feb 1 → Mar 1）は閏年でも非閏年でも gap なし
    const feb1_2024 = Date.UTC(2024, 1, 1);
    const mar1_2024 = Date.UTC(2024, 2, 1);
    expect(detectGaps([c(feb1_2024), c(mar1_2024)], "1month")).toEqual([]);
    const feb1_2025 = Date.UTC(2025, 1, 1);
    const mar1_2025 = Date.UTC(2025, 2, 1);
    expect(detectGaps([c(feb1_2025), c(mar1_2025)], "1month")).toEqual([]);
  });

  it("detects 1month gap across year boundary (Dec → Feb 翌年, UTC)", () => {
    // Dec 1, 2026 と Feb 1, 2027 で Jan 1, 2027 が欠損 (missing=1)
    const dec1 = Date.UTC(2026, 11, 1);
    const feb1 = Date.UTC(2027, 1, 1);
    expect(detectGaps([c(dec1), c(feb1)], "1month")).toEqual([
      { from: dec1, to: feb1, missing: 1 },
    ]);
  });

  it("returns empty for unknown types", () => {
    expect(detectGaps([c(0), c(1_000_000)], "bogus")).toEqual([]);
  });

  it("counts missing boundaries even for non-aligned timestamps", () => {
    // delta = 1.5 * step (1min) → 0 と 90_000 の間に boundary 60_000 がある → missing=1
    expect(detectGaps([c(0), c(90_000)], "1min")).toEqual([{ from: 0, to: 90_000, missing: 1 }]);
    // delta = 2.5 * step → 60_000 と 120_000 が間に挟まる → missing=2
    expect(detectGaps([c(0), c(150_000)], "1min")).toEqual([{ from: 0, to: 150_000, missing: 2 }]);
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

  it("works for 1day in UTC", () => {
    // last = 2026-01-01 00:00 UTC, now = 2026-01-01 12:00 UTC → 日中なので未確定
    const last = Date.UTC(2026, 0, 1);
    const now = last + 12 * 3_600_000;
    expect(detectLastIncomplete([c(last)], "1day", now)).toBe(true);
    // now = 2026-01-02 00:00 UTC → 確定済み
    expect(detectLastIncomplete([c(last)], "1day", last + 86_400_000)).toBe(false);
  });

  it("works for 1month (UTC 翌月 1 日 00:00 で判定)", () => {
    // last = 2026-01-01 00:00 UTC (January candle)
    const last = Date.UTC(2026, 0, 1);
    // now = 2026-01-15 → January はまだ未確定
    expect(detectLastIncomplete([c(last)], "1month", last + 14 * 86_400_000)).toBe(true);
    // now = 2026-02-01 00:00 UTC → January 完了
    const feb1 = Date.UTC(2026, 1, 1);
    expect(detectLastIncomplete([c(last)], "1month", feb1)).toBe(false);
    // now = 2026-01-31 23:59 UTC → まだ未確定
    expect(detectLastIncomplete([c(last)], "1month", feb1 - 60_000)).toBe(true);
  });

  it("handles December → January rollover for 1month (UTC)", () => {
    const last = Date.UTC(2026, 11, 1);
    const jan1 = Date.UTC(2027, 0, 1);
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
