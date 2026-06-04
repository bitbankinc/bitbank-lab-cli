import { describe, expect, it } from "vitest";
import { fetchOne, VALID_TYPES } from "../../commands/public/candles-fetch.js";
import { YEARLY_TYPES } from "../../date-utils.js";
import { mockFetchRaw } from "../test-helpers.js";

describe("VALID_TYPES", () => {
  it("includes common candle types", () => {
    expect(VALID_TYPES).toContain("1min");
    expect(VALID_TYPES).toContain("1day");
    expect(VALID_TYPES).toContain("1week");
  });
});

describe("YEARLY_TYPES", () => {
  it("includes 1day but not 1min", () => {
    expect(YEARLY_TYPES.has("1day")).toBe(true);
    expect(YEARLY_TYPES.has("1min")).toBe(false);
  });
});

describe("fetchOne", () => {
  it("returns parsed candle data on success", async () => {
    const mockData = {
      candlestick: [
        {
          type: "1day",
          ohlcv: [["100", "200", "50", "150", "1000", 1700000000000]],
        },
      ],
    };
    const result = await fetchOne(
      "btc_jpy",
      "1day",
      "2024",
      {
        fetch: mockFetchRaw({ success: 1, data: mockData }),
        retries: 0,
      },
      true,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]).toEqual({
        open: 100,
        high: 200,
        low: 50,
        close: 150,
        vol: 1000,
        timestamp: 1700000000000,
      });
    }
  });

  it("returns error on invalid response", async () => {
    const result = await fetchOne(
      "btc_jpy",
      "1day",
      "2024",
      {
        fetch: mockFetchRaw({ success: 1, data: { invalid: true } }),
        retries: 0,
      },
      true,
    );
    expect(result.success).toBe(false);
  });

  it("returns error when API fails", async () => {
    const result = await fetchOne(
      "btc_jpy",
      "1day",
      "2024",
      {
        fetch: mockFetchRaw({ success: 0, data: { code: 10000 } }),
        retries: 0,
      },
      true,
    );
    expect(result.success).toBe(false);
  });
});
