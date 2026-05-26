// 100行超: candles の YYYYMMDD/yyyy 分岐を網羅
import { describe, expect, it, vi } from "vitest";
import { candles, shiftDate } from "../../commands/public/candles.js";
import { nextBoundaryMs, rowsPerSegment } from "../../date-utils.js";
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

  it("handles leap day transitions", () => {
    expect(shiftDate("20240228", 1, "1min")).toBe("20240229");
    expect(shiftDate("20240229", 1, "1min")).toBe("20240301");
    expect(shiftDate("20240228", 1, "1hour")).toBe("20240229");
    expect(shiftDate("20230228", 1, "1min")).toBe("20230301");
  });
});

describe("rowsPerSegment", () => {
  it("returns 366 for 1day in leap years", () => {
    expect(rowsPerSegment("1day", 2024)).toBe(366);
    expect(rowsPerSegment("1day", 2000)).toBe(366);
  });

  it("returns 365 for 1day in non-leap years", () => {
    expect(rowsPerSegment("1day", 2025)).toBe(365);
    expect(rowsPerSegment("1day", 1900)).toBe(365);
  });

  it("adjusts 4hour / 8hour / 12hour for leap years", () => {
    expect(rowsPerSegment("4hour", 2024)).toBe(2196);
    expect(rowsPerSegment("4hour", 2025)).toBe(2190);
    expect(rowsPerSegment("8hour", 2024)).toBe(1098);
    expect(rowsPerSegment("12hour", 2024)).toBe(732);
  });

  it("does not adjust 1week / 1month for leap years", () => {
    expect(rowsPerSegment("1week", 2024)).toBe(52);
    expect(rowsPerSegment("1month", 2024)).toBe(12);
  });

  it("returns leap-year max when year is omitted", () => {
    expect(rowsPerSegment("1day")).toBe(366);
    expect(rowsPerSegment("4hour")).toBe(2196);
  });

  it("ignores year for short types", () => {
    expect(rowsPerSegment("1hour", 2024)).toBe(24);
    expect(rowsPerSegment("1min")).toBe(1440);
  });
});

describe("nextBoundaryMs", () => {
  it("returns ts + step for sub-daily types", () => {
    expect(nextBoundaryMs("1min", 0)).toBe(60_000);
    expect(nextBoundaryMs("5min", 0)).toBe(300_000);
    expect(nextBoundaryMs("15min", 0)).toBe(900_000);
    expect(nextBoundaryMs("30min", 0)).toBe(1_800_000);
    expect(nextBoundaryMs("1hour", 1_000_000)).toBe(1_000_000 + 3_600_000);
  });

  it("returns ts + step for yearly fixed types", () => {
    expect(nextBoundaryMs("4hour", 0)).toBe(14_400_000);
    expect(nextBoundaryMs("8hour", 0)).toBe(28_800_000);
    expect(nextBoundaryMs("12hour", 0)).toBe(43_200_000);
    expect(nextBoundaryMs("1day", 0)).toBe(86_400_000);
    expect(nextBoundaryMs("1week", 0)).toBe(7 * 86_400_000);
  });

  it("returns UTC first-of-next-month for 1month", () => {
    const jan1 = Date.UTC(2026, 0, 1);
    const feb1 = Date.UTC(2026, 1, 1);
    expect(nextBoundaryMs("1month", jan1)).toBe(feb1);
  });

  it("handles December → January year rollover for 1month", () => {
    const dec1_2026 = Date.UTC(2026, 11, 1);
    const jan1_2027 = Date.UTC(2027, 0, 1);
    expect(nextBoundaryMs("1month", dec1_2026)).toBe(jan1_2027);
  });

  it("handles February in leap and non-leap years for 1month", () => {
    const feb1_2024 = Date.UTC(2024, 1, 1);
    const mar1_2024 = Date.UTC(2024, 2, 1);
    expect(nextBoundaryMs("1month", feb1_2024)).toBe(mar1_2024);
    const feb1_2025 = Date.UTC(2025, 1, 1);
    const mar1_2025 = Date.UTC(2025, 2, 1);
    expect(nextBoundaryMs("1month", feb1_2025)).toBe(mar1_2025);
  });

  // 実 API 観測値: GET /btc_jpy/candlestick/1day/2026 の先頭 timestamp
  // = 1767225600000 = 2026-01-01T00:00:00Z（UTC 00:00 起点であることの回帰確認）
  it("matches real-API observed UTC 00:00 anchor for 1day/1month", () => {
    const jan1Utc = 1767225600000;
    expect(jan1Utc).toBe(Date.UTC(2026, 0, 1));
    expect(nextBoundaryMs("1day", jan1Utc)).toBe(jan1Utc + 86_400_000);
    expect(nextBoundaryMs("1month", jan1Utc)).toBe(Date.UTC(2026, 1, 1));
  });

  it("returns 0 for unknown type", () => {
    expect(nextBoundaryMs("bogus", 1000)).toBe(0);
  });
});

describe("candles meta.lastIsIncomplete", () => {
  it("sets lastIsIncomplete: true when --date today and last candle period is current", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-25T03:30:00Z")); // UTC 03:30
    try {
      const mock = {
        candlestick: [
          {
            type: "1hour",
            ohlcv: [
              ["100", "110", "90", "105", "50", Date.UTC(2026, 4, 25, 2, 0)], // UTC 02:00 → done
              ["105", "115", "95", "110", "60", Date.UTC(2026, 4, 25, 3, 0)], // UTC 03:00 → incomplete
            ],
          },
        ],
      };
      const result = await candles(
        { pair: "btc_jpy", type: "1hour", date: "20260525", noCache: true },
        { fetch: mockFetchData(mock), retries: 0 },
      );
      expect(result.success).toBe(true);
      if (result.success) expect(result.meta?.lastIsIncomplete).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not set lastIsIncomplete when --date is fully in the past", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-25T03:30:00Z"));
    try {
      const mock = {
        candlestick: [
          {
            type: "1hour",
            ohlcv: [
              ["100", "110", "90", "105", "50", Date.UTC(2026, 4, 24, 2, 0)],
              ["105", "115", "95", "110", "60", Date.UTC(2026, 4, 24, 3, 0)],
            ],
          },
        ],
      };
      const result = await candles(
        { pair: "btc_jpy", type: "1hour", date: "20260524", noCache: true },
        { fetch: mockFetchData(mock), retries: 0 },
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.meta?.lastIsIncomplete).toBeUndefined();
        // 過去日のときは meta 自体が undefined（他フラグも無いケース）
        expect(result.meta).toBeUndefined();
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("sets lastIsIncomplete in auto-merge path when last is current", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-25T03:30:00Z"));
    try {
      const mock = {
        candlestick: [
          {
            type: "1hour",
            ohlcv: [
              ["100", "110", "90", "105", "50", Date.UTC(2026, 4, 25, 2, 0)],
              ["105", "115", "95", "110", "60", Date.UTC(2026, 4, 25, 3, 0)],
            ],
          },
        ],
      };
      const result = await candles(
        { pair: "btc_jpy", type: "1hour", limit: 2, noCache: true },
        { fetch: mockFetchData(mock), retries: 0 },
      );
      expect(result.success).toBe(true);
      if (result.success) expect(result.meta?.lastIsIncomplete).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("works for 1min boundary (incomplete when within the current minute)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-25T03:30:30Z"));
    try {
      const mock = {
        candlestick: [
          {
            type: "1min",
            ohlcv: [
              ["100", "110", "90", "105", "50", Date.UTC(2026, 4, 25, 3, 30)], // UTC 03:30
            ],
          },
        ],
      };
      const result = await candles(
        { pair: "btc_jpy", type: "1min", date: "20260525", noCache: true },
        { fetch: mockFetchData(mock), retries: 0 },
      );
      expect(result.success).toBe(true);
      if (result.success) expect(result.meta?.lastIsIncomplete).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("works for 1day boundary (incomplete when within today's UTC day)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-25T03:30:00Z")); // UTC 03:30 on 2026-05-25
    try {
      const todayUtc = Date.UTC(2026, 4, 25); // UTC 00:00 on 2026-05-25
      const mock = {
        candlestick: [
          {
            type: "1day",
            ohlcv: [["100", "110", "90", "105", "50", todayUtc]],
          },
        ],
      };
      const result = await candles(
        { pair: "btc_jpy", type: "1day", date: "2026", noCache: true },
        { fetch: mockFetchData(mock), retries: 0 },
      );
      expect(result.success).toBe(true);
      if (result.success) expect(result.meta?.lastIsIncomplete).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("works for 1month boundary (incomplete during current UTC month)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-15T03:00:00Z")); // mid-May UTC
    try {
      const may1 = Date.UTC(2026, 4, 1); // 2026-05-01 00:00 UTC
      const mock = {
        candlestick: [
          {
            type: "1month",
            ohlcv: [["100", "110", "90", "105", "50", may1]],
          },
        ],
      };
      const result = await candles(
        { pair: "btc_jpy", type: "1month", date: "2026", noCache: true },
        { fetch: mockFetchData(mock), retries: 0 },
      );
      expect(result.success).toBe(true);
      if (result.success) expect(result.meta?.lastIsIncomplete).toBe(true);
    } finally {
      vi.useRealTimers();
    }
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
      expect(result.partial).toBe(true);
      expect(result.meta?.truncated).toBeUndefined();
    }
  });

  it("does not overwrite fetch failure with HARD_MAX_SEGMENTS meta", async () => {
    const tinyData = {
      candlestick: [{ type: "1day", ohlcv: [["1", "1", "1", "1", "1", 1000]] }],
    };
    let callCount = 0;
    const errorAfterFew: typeof globalThis.fetch = async () => {
      callCount++;
      if (callCount <= 3) {
        return new Response(JSON.stringify({ success: 1, data: tinyData }));
      }
      return new Response(JSON.stringify({ success: 0, data: { code: 10000 } }), { status: 500 });
    };
    // limit が極端なので idealNeeded > HARD_MAX_SEGMENTS だが、途中 fetch 失敗の方を優先したい
    const result = await candles(
      { pair: "btc_jpy", type: "1day", limit: 1_000_000, noCache: true },
      { fetch: errorAfterFew, retries: 0 },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.partial).toBe(true);
      expect(result.meta?.truncated).toBeUndefined();
      expect(result.meta?.reason).toBeUndefined();
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
    if (result.success) {
      expect(result.partial).toBe(true);
      expect(result.meta?.truncated).toBe(true);
      expect(result.meta?.reason).toBe("HARD_MAX_SEGMENTS");
      expect(result.meta?.requestedLimit).toBe(1_000_000);
      expect(result.meta?.returnedRows).toBe(result.data.length);
    }
  });

  it("does not set truncated meta when limit fits within HARD_MAX_SEGMENTS", async () => {
    const dayData = {
      candlestick: [
        {
          type: "1hour",
          ohlcv: Array.from({ length: 24 }, (_, i) => ["100", "110", "90", "105", "50", 1000 + i]),
        },
      ],
    };
    const fetchHours: typeof globalThis.fetch = async () =>
      new Response(JSON.stringify({ success: 1, data: dayData }));
    const result = await candles(
      { pair: "btc_jpy", type: "1hour", limit: 200, noCache: true },
      { fetch: fetchHours, retries: 0 },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.partial).toBeUndefined();
      expect(result.meta?.truncated).toBeUndefined();
    }
  });

  it("uses 366 (not 365) for segment count when starting year is leap (1day)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2024-06-15T00:00:00Z"));
    try {
      const leapData = {
        candlestick: [
          {
            type: "1day",
            ohlcv: Array.from({ length: 366 }, (_, i) => [
              "100",
              "110",
              "90",
              "105",
              "50",
              1000 + i,
            ]),
          },
        ],
      };
      const nonLeapData = {
        candlestick: [
          {
            type: "1day",
            ohlcv: Array.from({ length: 365 }, (_, i) => [
              "100",
              "110",
              "90",
              "105",
              "50",
              2000 + i,
            ]),
          },
        ],
      };
      let callCount = 0;
      const fetchYears: typeof globalThis.fetch = async (input) => {
        callCount++;
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : (input as Request).url;
        const data = url.includes("/2024") ? leapData : nonLeapData;
        return new Response(JSON.stringify({ success: 1, data }));
      };
      // remaining = 1098 - 366 = 732
      //   leap-aware (366): needed = ceil(732/366) = 2 → 3 total calls
      //   old non-leap (365): needed = ceil(732/365) = 3 → 4 total calls
      const result = await candles(
        { pair: "btc_jpy", type: "1day", limit: 1098, noCache: true },
        { fetch: fetchYears, retries: 0 },
      );
      expect(result.success).toBe(true);
      expect(callCount).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("computes fetch count from limit and rows-per-segment for 1hour", async () => {
    // 各呼び出しで unique な timestamp を返す（normalizeCandles の dedup で潰されないように）
    const dayData = (base: number) => ({
      candlestick: [
        {
          type: "1hour",
          ohlcv: Array.from({ length: 24 }, (_, i) => [
            "100",
            "110",
            "90",
            "105",
            "50",
            base + i * 3_600_000,
          ]),
        },
      ],
    });
    let callCount = 0;
    const fetchHours: typeof globalThis.fetch = async () => {
      const base = callCount * 24 * 3_600_000;
      callCount++;
      return new Response(JSON.stringify({ success: 1, data: dayData(base) }));
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
