import { describe, expect, it } from "vitest";
import { candles } from "../../../commands/public/candles.js";

const MINIMAL_1MIN = {
  candlestick: [{ type: "1min", ohlcv: [["1", "1", "1", "1", "1", 1000]] }],
};
const MINIMAL_1DAY = {
  candlestick: [{ type: "1day", ohlcv: [["1", "1", "1", "1", "1", 1000]] }],
};

describe("Chaos P-11: range truncation is surfaced via meta", () => {
  it("MAX_RANGE_FETCHES: 367-day range sets meta.truncated", async () => {
    const fetchAll: typeof globalThis.fetch = async () =>
      new Response(JSON.stringify({ success: 1, data: MINIMAL_1MIN }));
    const r = await candles(
      { pair: "btc_jpy", type: "1min", from: "20200101", to: "20210101", noCache: true },
      { fetch: fetchAll, retries: 0, throttleMs: 0 },
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.partial).toBe(true);
      expect(r.meta?.truncated).toBe(true);
      expect(r.meta?.reason).toBe("MAX_RANGE_FETCHES");
      expect(r.meta?.truncatedAt).toBeDefined();
    }
  });

  it("MAX_RANGE_FETCHES: range within 366 days does NOT set meta.truncated", async () => {
    const fetchAll: typeof globalThis.fetch = async () =>
      new Response(JSON.stringify({ success: 1, data: MINIMAL_1MIN }));
    // exactly 366 days: 20200101..20201231 (leap year)
    const r = await candles(
      { pair: "btc_jpy", type: "1min", from: "20200101", to: "20201231", noCache: true },
      { fetch: fetchAll, retries: 0, throttleMs: 0 },
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.partial).toBeUndefined();
      expect(r.meta?.truncated).toBeUndefined();
    }
  });

  it("HARD_MAX_SEGMENTS: absurd --limit sets meta.truncated with requestedLimit", async () => {
    const fetchAll: typeof globalThis.fetch = async () =>
      new Response(JSON.stringify({ success: 1, data: MINIMAL_1DAY }));
    const r = await candles(
      { pair: "btc_jpy", type: "1day", limit: 1_000_000, noCache: true },
      { fetch: fetchAll, retries: 0 },
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.partial).toBe(true);
      expect(r.meta?.truncated).toBe(true);
      expect(r.meta?.reason).toBe("HARD_MAX_SEGMENTS");
      expect(r.meta?.requestedLimit).toBe(1_000_000);
      expect(typeof r.meta?.returnedRows).toBe("number");
    }
  });
});
