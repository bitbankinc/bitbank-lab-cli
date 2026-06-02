import { describe, expect, it } from "vitest";
import { DEFAULT_TAKER_FEE_RATE, feeRole, resolveFeeRate } from "../fees.js";
import type { CachedPair } from "../pairs-cache.js";

// _quote 側だけを resolveFeeRate が見るので、_base は意図的に別値にして
// 取り違えがないことを担保する。
function makePair(overrides: Partial<CachedPair> = {}): CachedPair {
  return {
    name: "btc_jpy",
    base_asset: "btc",
    quote_asset: "jpy",
    maker_fee_rate_base: 0.0099,
    taker_fee_rate_base: 0.0099,
    maker_fee_rate_quote: -0.0002,
    taker_fee_rate_quote: 0.0012,
    unit_amount: 0.0001,
    limit_max_amount: 1000,
    market_max_amount: 1000,
    price_digits: 0,
    amount_digits: 4,
    is_enabled: true,
    stop_order: false,
    stop_order_and_cancel: false,
    ...overrides,
  };
}

describe("resolveFeeRate", () => {
  it("selects the quote rate matching the role", () => {
    const pair = makePair({ maker_fee_rate_quote: -0.0002, taker_fee_rate_quote: 0.0012 });
    expect(resolveFeeRate(pair, "maker")).toBe(-0.0002);
    expect(resolveFeeRate(pair, "taker")).toBe(0.0012);
  });

  it("uses *_quote, never *_base", () => {
    const pair = makePair({ taker_fee_rate_quote: 0.0012, taker_fee_rate_base: 0.0099 });
    expect(resolveFeeRate(pair, "taker")).toBe(0.0012);
  });

  it("prefers override over pair and default", () => {
    const pair = makePair({ taker_fee_rate_quote: 0.0012 });
    expect(resolveFeeRate(pair, "taker", 0.005)).toBe(0.005);
    expect(resolveFeeRate(pair, "maker", 0.005)).toBe(0.005);
    // pair 不在でも override が最優先
    expect(resolveFeeRate(undefined, "taker", 0.003)).toBe(0.003);
  });

  it("falls back to DEFAULT_TAKER_FEE_RATE when pair is undefined", () => {
    expect(resolveFeeRate(undefined, "taker")).toBe(DEFAULT_TAKER_FEE_RATE);
    expect(resolveFeeRate(undefined, "maker")).toBe(DEFAULT_TAKER_FEE_RATE);
  });

  it("returns negative maker rebate as-is (no clamp to 0)", () => {
    const pair = makePair({ maker_fee_rate_quote: -0.0002 });
    expect(resolveFeeRate(pair, "maker")).toBe(-0.0002);
  });

  it("keeps a campaign 0 rate instead of falling back to default", () => {
    const pair = makePair({ taker_fee_rate_quote: 0, maker_fee_rate_quote: 0 });
    expect(resolveFeeRate(pair, "taker")).toBe(0);
    expect(resolveFeeRate(pair, "maker")).toBe(0);
  });
});

describe("feeRole", () => {
  it("maps market and stop to taker", () => {
    expect(feeRole("market")).toBe("taker");
    expect(feeRole("stop")).toBe("taker");
  });

  it("maps limit and stop_limit to maker", () => {
    expect(feeRole("limit")).toBe("maker");
    expect(feeRole("stop_limit")).toBe("maker");
  });

  it("forces maker when post_only is true, even for market", () => {
    expect(feeRole("market", true)).toBe("maker");
    expect(feeRole("limit", true)).toBe("maker");
  });

  it("does not force maker when post_only is false or omitted", () => {
    expect(feeRole("market", false)).toBe("taker");
    expect(feeRole("limit", false)).toBe("maker");
    expect(feeRole("market")).toBe("taker");
  });
});
