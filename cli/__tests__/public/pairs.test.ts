import { describe, expect, it } from "vitest";
import { pairs } from "../../commands/public/pairs.js";
import { mockFetchData, mockFetchRaw } from "../test-helpers.js";

const MOCK_DATA = {
  pairs: [
    {
      name: "btc_jpy",
      base_asset: "btc",
      quote_asset: "jpy",
      maker_fee_rate_base: "0",
      taker_fee_rate_base: "0",
      maker_fee_rate_quote: "0",
      taker_fee_rate_quote: "0.0012",
      unit_amount: "0.0001",
      limit_max_amount: "1000",
      market_max_amount: "100",
      price_digits: 0,
      amount_digits: 4,
      is_enabled: true,
      stop_order: true,
      stop_order_and_cancel: true,
    },
  ],
};

describe("pairs", () => {
  it("returns parsed pairs", async () => {
    const result = await pairs({ fetch: mockFetchData(MOCK_DATA), retries: 0 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].name).toBe("btc_jpy");
      expect(result.data[0].is_enabled).toBe(true);
    }
  });

  it("requests api.bitbank.cc (not public.bitbank.cc)", async () => {
    let capturedUrl = "";
    const captureFetch: typeof globalThis.fetch = async (input) => {
      capturedUrl = input.toString();
      return new Response(JSON.stringify({ success: 1, data: MOCK_DATA }));
    };
    await pairs({ fetch: captureFetch, retries: 0 });
    expect(capturedUrl).toBe("https://api.bitbank.cc/v1/spot/pairs");
  });

  it("propagates API error", async () => {
    const result = await pairs({
      fetch: mockFetchRaw({ success: 0, data: { code: 70001 } }),
      retries: 0,
    });
    expect(result.success).toBe(false);
  });

  it("returns error on invalid response shape", async () => {
    const result = await pairs({ fetch: mockFetchData("invalid"), retries: 0 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Invalid response");
  });
});
