import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pairs } from "../../commands/public/pairs.js";
import { mockFetchData, mockFetchRaw } from "../test-helpers.js";

// 公開 API /v1/spot/pairs の無加工出力（2026-07-25 採取。tax のペアマスタと共用）。
// 実 API 形状で信用フィールドが通ることを、即席モックではなくこれで確かめる。
const REAL_PAIRS = (
  JSON.parse(
    readFileSync(new URL("../__fixtures__/tax/pairs-master.json", import.meta.url), "utf-8"),
  ) as { pairs: unknown[] }
).pairs;

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

describe("pairs: margin fields (ADR-010)", () => {
  it("parses the real API shape: margin values on btc_jpy, null on a non-margin pair", async () => {
    const r = await pairs({ fetch: mockFetchData({ pairs: REAL_PAIRS }), retries: 0 });
    expect(r.success).toBe(true);
    if (!r.success) return;
    const btc = r.data.find((p) => p.name === "btc_jpy");
    expect(btc?.margin_current_individual_ratio).toBe(0.5);
    expect(btc?.margin_current_individual_until).toBe(1785250799999);
    expect(btc?.margin_long_interest).toBe(0.0004);
    expect(btc?.margin_open_taker_fee_rate_quote).toBe(0.001);
    expect(btc?.stop_margin_long_order).toBe(false);
    const ltc = r.data.find((p) => p.name === "ltc_jpy");
    expect(ltc?.margin_current_individual_ratio).toBe(null);
    expect(ltc?.margin_open_taker_fee_rate_quote).toBe(null);
  });

  it("only the 5 margin-enabled pairs carry a risk ratio in the real fixture", async () => {
    const r = await pairs({ fetch: mockFetchData({ pairs: REAL_PAIRS }), retries: 0 });
    if (!r.success) throw new Error(r.error);
    const marginPairs = r.data
      .filter((p) => p.margin_current_individual_ratio != null)
      .map((p) => p.name)
      .sort();
    expect(marginPairs).toEqual(["btc_jpy", "doge_jpy", "eth_jpy", "sol_jpy", "xrp_jpy"]);
  });

  it("still parses a response without margin fields (spot paths are unaffected)", async () => {
    const r = await pairs({ fetch: mockFetchData(MOCK_DATA), retries: 0 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data[0].margin_current_individual_ratio).toBeUndefined();
  });

  it("rejects a non-numeric margin rate instead of passing it through", async () => {
    const bad = { pairs: [{ ...MOCK_DATA.pairs[0], margin_long_interest: "abc" }] };
    const r = await pairs({ fetch: mockFetchData(bad), retries: 0 });
    expect(r.success).toBe(false);
  });
});
