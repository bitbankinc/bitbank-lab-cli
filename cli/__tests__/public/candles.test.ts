import { describe, expect, it } from "vitest";
import { candles, shiftDate } from "../../commands/public/candles.js";
import { mockFetchData } from "../test-helpers.js";

const MOCK_DATA = {
  candlestick: [
    {
      type: "1hour",
      ohlcv: [
        ["100", "110", "90", "105", "50", 1000],
        ["105", "115", "95", "110", "60", 2000],
        ["110", "120", "100", "115", "70", 3000],
      ],
    },
  ],
};

describe("candles", () => {
  it("returns error when pair is missing", async () => {
    const result = await candles({ pair: undefined, type: "1hour", limit: 100 });
    expect(result.success).toBe(false);
  });

  it("returns error when type is missing", async () => {
    const result = await candles({ pair: "btc_jpy", type: undefined, limit: 100 });
    expect(result.success).toBe(false);
  });

  it("returns parsed candles", async () => {
    const result = await candles(
      { pair: "btc_jpy", type: "1hour", date: "20240101", limit: 100, noCache: true },
      { fetch: mockFetchData(MOCK_DATA), retries: 0 },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(3);
      expect(result.data[0].open).toBe(100);
      expect(result.data[0].close).toBe(105);
    }
  });

  it("returns error when yearly type gets daily date", async () => {
    const result = await candles({ pair: "btc_jpy", type: "1day", date: "20250301", limit: 100 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("must be a year");
  });

  it("returns error when daily type gets yearly date", async () => {
    const result = await candles({ pair: "btc_jpy", type: "1hour", date: "2025", limit: 100 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("must be a date");
  });

  it("respects limit", async () => {
    const result = await candles(
      { pair: "btc_jpy", type: "1hour", date: "20240101", limit: 2, noCache: true },
      { fetch: mockFetchData(MOCK_DATA), retries: 0 },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0].timestamp).toBe(2000);
    }
  });

  it("returns all rows when --date is set and --limit is omitted", async () => {
    const bigData = {
      candlestick: [
        {
          type: "1day",
          ohlcv: Array.from({ length: 365 }, (_, i) => ["100", "110", "90", "105", "50", 1000 + i]),
        },
      ],
    };
    const result = await candles(
      { pair: "btc_jpy", type: "1day", date: "2025", noCache: true },
      { fetch: mockFetchData(bigData), retries: 0 },
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toHaveLength(365);
  });

  it("does not auto-merge when --date is explicit", async () => {
    let callCount = 0;
    const countingFetch: typeof globalThis.fetch = async () => {
      callCount++;
      return new Response(JSON.stringify({ success: 1, data: MOCK_DATA }));
    };
    const result = await candles(
      { pair: "btc_jpy", type: "1day", date: "2026", limit: 10, noCache: true },
      { fetch: countingFetch, retries: 0 },
    );
    expect(result.success).toBe(true);
    expect(callCount).toBe(1);
  });
});

describe("shiftDate", () => {
  it("decrements year for yearly types", () => {
    expect(shiftDate("2026", -1, "1day")).toBe("2025");
    expect(shiftDate("2025", -1, "4hour")).toBe("2024");
    expect(shiftDate("2025", -1, "1month")).toBe("2024");
  });

  it("decrements day for daily types", () => {
    expect(shiftDate("20260325", -1, "1hour")).toBe("20260324");
    expect(shiftDate("20260301", -1, "5min")).toBe("20260228");
    expect(shiftDate("20260101", -1, "1min")).toBe("20251231");
  });

  it("increments year for yearly types", () => {
    expect(shiftDate("2024", 1, "1day")).toBe("2025");
    expect(shiftDate("2025", 1, "1month")).toBe("2026");
  });

  it("increments day for daily types", () => {
    expect(shiftDate("20260329", 1, "1hour")).toBe("20260330");
    expect(shiftDate("20260331", 1, "1hour")).toBe("20260401");
    expect(shiftDate("20261231", 1, "1min")).toBe("20270101");
  });
});

describe("candles auto-merge", () => {
  it("fetches previous period when limit exceeds single response", async () => {
    const year2026 = {
      candlestick: [
        {
          type: "1day",
          ohlcv: [
            ["100", "110", "90", "105", "50", 4000],
            ["105", "115", "95", "110", "60", 5000],
          ],
        },
      ],
    };
    const year2025 = {
      candlestick: [
        {
          type: "1day",
          ohlcv: [
            ["80", "90", "70", "85", "40", 1000],
            ["85", "95", "75", "90", "45", 2000],
            ["90", "100", "80", "95", "50", 3000],
          ],
        },
      ],
    };

    const mergeFetch: typeof globalThis.fetch = async (input) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      const data = url.includes("/2025") ? year2025 : year2026;
      return new Response(JSON.stringify({ success: 1, data }));
    };

    const result = await candles(
      { pair: "btc_jpy", type: "1day", limit: 5, noCache: true },
      { fetch: mergeFetch, retries: 0 },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(5);
      expect(result.data[0].timestamp).toBe(1000);
      expect(result.data[4].timestamp).toBe(5000);
    }
  });

  it("stops on fetch error for previous period", async () => {
    const currentData = {
      candlestick: [
        {
          type: "1day",
          ohlcv: [
            ["100", "110", "90", "105", "50", 1000],
            ["105", "115", "95", "110", "60", 2000],
          ],
        },
      ],
    };

    let callCount = 0;
    const errorFetch: typeof globalThis.fetch = async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ success: 1, data: currentData }));
      }
      return new Response(JSON.stringify({ success: 0, data: { code: 10000 } }), { status: 404 });
    };

    const result = await candles(
      { pair: "btc_jpy", type: "1day", limit: 10, noCache: true },
      { fetch: errorFetch, retries: 0 },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
      expect(callCount).toBe(2);
    }
  });

  it("defaults to 1000 rows when --date and --limit are both omitted", async () => {
    const yearData = (start: number) => ({
      candlestick: [
        {
          type: "1day",
          ohlcv: Array.from({ length: 365 }, (_, i) => [
            "100",
            "110",
            "90",
            "105",
            "50",
            start + i,
          ]),
        },
      ],
    });
    let call = 0;
    const fetchYears: typeof globalThis.fetch = async () => {
      call++;
      return new Response(JSON.stringify({ success: 1, data: yearData(call * 10000) }));
    };
    const result = await candles(
      { pair: "btc_jpy", type: "1day", noCache: true },
      { fetch: fetchYears, retries: 0 },
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toHaveLength(1000);
    expect(call).toBe(3);
  });

  it("caps at HARD_MAX_SEGMENTS for absurd limits", async () => {
    const tinyData = {
      candlestick: [
        {
          type: "1day",
          ohlcv: [["100", "110", "90", "105", "50", 1000]],
        },
      ],
    };
    let callCount = 0;
    const manyFetch: typeof globalThis.fetch = async () => {
      callCount++;
      return new Response(JSON.stringify({ success: 1, data: tinyData }));
    };
    const result = await candles(
      { pair: "btc_jpy", type: "1day", limit: 1_000_000, noCache: true },
      { fetch: manyFetch, retries: 0 },
    );
    expect(result.success).toBe(true);
    expect(callCount).toBe(101); // 1 initial + 100 older (HARD_MAX_SEGMENTS)
  });

  it("computes fetch count from limit and rows-per-segment for 1hour", async () => {
    const dayData = {
      candlestick: [
        {
          type: "1hour",
          ohlcv: Array.from({ length: 24 }, (_, i) => ["100", "110", "90", "105", "50", 1000 + i]),
        },
      ],
    };
    let callCount = 0;
    const fetchHours: typeof globalThis.fetch = async () => {
      callCount++;
      return new Response(JSON.stringify({ success: 1, data: dayData }));
    };
    const result = await candles(
      { pair: "btc_jpy", type: "1hour", limit: 200, noCache: true },
      { fetch: fetchHours, retries: 0 },
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toHaveLength(200);
    // ceil((200 - 24) / 24) = 8 older + 1 first = 9
    expect(callCount).toBe(9);
  });
});
