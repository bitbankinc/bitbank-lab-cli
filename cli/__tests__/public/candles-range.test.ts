// 100行超: candles range の境界を網羅
import { describe, expect, it } from "vitest";
import { candles } from "../../commands/public/candles.js";

const makeData = (type: string, ohlcv: unknown[][]) => ({
  candlestick: [{ type, ohlcv }],
});

describe("candles --from/--to", () => {
  it("returns error when only --from is given", async () => {
    const result = await candles({ pair: "btc_jpy", type: "1day", from: "2024" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("must both be specified");
  });

  it("returns error when only --to is given", async () => {
    const result = await candles({ pair: "btc_jpy", type: "1day", to: "2026" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("must both be specified");
  });

  it("returns error when --date and --from/--to are combined", async () => {
    const result = await candles({
      pair: "btc_jpy",
      type: "1day",
      date: "2025",
      from: "2024",
      to: "2026",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("cannot be used together");
  });

  it("returns error when --from > --to", async () => {
    const result = await candles({ pair: "btc_jpy", type: "1day", from: "2026", to: "2024" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("before or equal to");
  });

  it("returns error when format is wrong for yearly type", async () => {
    const result = await candles({
      pair: "btc_jpy",
      type: "1day",
      from: "20240101",
      to: "20260101",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("must be a year");
  });

  it("returns error when format is wrong for daily type", async () => {
    const result = await candles({ pair: "btc_jpy", type: "1hour", from: "2024", to: "2026" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("must be a date");
  });

  it("fetches multiple years for yearly types", async () => {
    const year2024 = makeData("1day", [["80", "90", "70", "85", "40", 1000]]);
    const year2025 = makeData("1day", [["90", "100", "80", "95", "50", 2000]]);
    const year2026 = makeData("1day", [["100", "110", "90", "105", "60", 3000]]);

    const urls: string[] = [];
    const rangeFetch: typeof globalThis.fetch = async (input) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      urls.push(url);
      const data = url.includes("/2024") ? year2024 : url.includes("/2025") ? year2025 : year2026;
      return new Response(JSON.stringify({ success: 1, data }));
    };

    const result = await candles(
      { pair: "btc_jpy", type: "1day", from: "2024", to: "2026", noCache: true },
      { fetch: rangeFetch, retries: 0 },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(3);
      expect(result.data[0].timestamp).toBe(1000);
      expect(result.data[2].timestamp).toBe(3000);
    }
    expect(urls).toHaveLength(3);
  });

  it("fetches multiple days for daily types", async () => {
    const day1 = makeData("1hour", [["100", "110", "90", "105", "50", 1000]]);
    const day2 = makeData("1hour", [["105", "115", "95", "110", "60", 2000]]);

    let callCount = 0;
    const rangeFetch: typeof globalThis.fetch = async () => {
      callCount++;
      const data = callCount === 1 ? day1 : day2;
      return new Response(JSON.stringify({ success: 1, data }));
    };

    const result = await candles(
      { pair: "btc_jpy", type: "1hour", from: "20260329", to: "20260330", noCache: true },
      { fetch: rangeFetch, retries: 0 },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
    }
    expect(callCount).toBe(2);
  });

  it("stops on first fetch error in range", async () => {
    const errorFetch: typeof globalThis.fetch = async () =>
      new Response(JSON.stringify({ success: 0, data: { code: 10000 } }), { status: 404 });

    const result = await candles(
      { pair: "btc_jpy", type: "1day", from: "2024", to: "2026", noCache: true },
      { fetch: errorFetch, retries: 0 },
    );
    expect(result.success).toBe(false);
  });

  it("returns partial: true when some fetches succeed then one fails", async () => {
    const year2024 = makeData("1day", [["80", "90", "70", "85", "40", 1000]]);
    let callCount = 0;
    const partialFetch: typeof globalThis.fetch = async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ success: 1, data: year2024 }));
      }
      return new Response(JSON.stringify({ success: 0, data: { code: 10000 } }), { status: 500 });
    };

    const result = await candles(
      { pair: "btc_jpy", type: "1day", from: "2024", to: "2026", noCache: true },
      { fetch: partialFetch, retries: 0 },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.partial).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].timestamp).toBe(1000);
    }
  });

  it("does not set partial on full success", async () => {
    const year2024 = makeData("1day", [["80", "90", "70", "85", "40", 1000]]);
    const year2025 = makeData("1day", [["90", "100", "80", "95", "50", 2000]]);

    let callCount = 0;
    const okFetch: typeof globalThis.fetch = async () => {
      callCount++;
      const data = callCount === 1 ? year2024 : year2025;
      return new Response(JSON.stringify({ success: 1, data }));
    };

    const result = await candles(
      { pair: "btc_jpy", type: "1day", from: "2024", to: "2025", noCache: true },
      { fetch: okFetch, retries: 0 },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.partial).toBeUndefined();
      expect(result.data).toHaveLength(2);
      expect(result.meta?.truncated).toBeUndefined();
    }
  });

  it("surfaces MAX_RANGE_FETCHES truncation via meta for 367-day range", async () => {
    const minimal = makeData("1min", [["1", "1", "1", "1", "1", 1000]]);
    let callCount = 0;
    const fetchAll: typeof globalThis.fetch = async () => {
      callCount++;
      return new Response(JSON.stringify({ success: 1, data: minimal }));
    };

    // 2020 is leap (366 days); 20200101..20210101 = 367 entries.
    // MAX_RANGE_FETCHES=366 drops the trailing 20210101.
    const result = await candles(
      { pair: "btc_jpy", type: "1min", from: "20200101", to: "20210101", noCache: true },
      { fetch: fetchAll, retries: 0, throttleMs: 0 },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.partial).toBe(true);
      expect(result.meta?.truncated).toBe(true);
      expect(result.meta?.truncatedAt).toBe("20210101");
      expect(result.meta?.reason).toBe("MAX_RANGE_FETCHES");
    }
    expect(callCount).toBe(366);
  });
});
