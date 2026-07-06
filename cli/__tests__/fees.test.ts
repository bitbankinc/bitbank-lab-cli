import { describe, expect, it } from "vitest";
import {
  DEFAULT_TAKER_FEE_RATE,
  estimateOrderFee,
  feeRole,
  resolveDryRunFee,
  resolveFeeRate,
} from "../fees.js";
import type { CachedPair } from "../pairs-cache.js";
import type { Result } from "../types.js";

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

// notional = 5000000 * 0.02 = 100000 を全ケースで使い、四捨五入とリベート方向を検証する。
const LIMIT_BUY = {
  pair: "btc_jpy",
  side: "buy",
  type: "limit",
  amount: "0.02",
  price: "5000000",
} as const;

describe("estimateOrderFee", () => {
  it("limit buy: maker 率で feeQuote と推定コスト（jpy 四捨五入）", () => {
    const fee = estimateOrderFee(makePair({ maker_fee_rate_quote: 0.0001 }), LIMIT_BUY);
    expect(fee).toMatchObject({
      role: "maker",
      rate: 0.0001,
      estimatedFeeQuote: 10,
      estimatedCostQuote: 100010,
    });
    expect(fee.note).toContain("maker は想定");
  });

  it("limit sell: proceeds = notional - feeQuote", () => {
    const fee = estimateOrderFee(makePair({ maker_fee_rate_quote: 0.0001 }), {
      ...LIMIT_BUY,
      side: "sell",
    });
    expect(fee.estimatedFeeQuote).toBe(10);
    expect(fee.estimatedCostQuote).toBe(99990);
  });

  it("negative maker → リベート: feeQuote<0, 買いコスト減・売り手取り増", () => {
    const pair = makePair({ maker_fee_rate_quote: -0.0002 });
    const buy = estimateOrderFee(pair, LIMIT_BUY);
    expect(buy.estimatedFeeQuote).toBe(-20);
    expect(buy.estimatedCostQuote).toBe(99980);
    const sell = estimateOrderFee(pair, { ...LIMIT_BUY, side: "sell" });
    expect(sell.estimatedCostQuote).toBe(100020);
  });

  it("campaign 0 maker rate → 手数料 0、コスト = notional", () => {
    const fee = estimateOrderFee(makePair({ maker_fee_rate_quote: 0 }), LIMIT_BUY);
    expect(fee.rate).toBe(0);
    expect(fee.estimatedFeeQuote).toBe(0);
    expect(fee.estimatedCostQuote).toBe(100000);
  });

  it("market: taker 率のみ＋約定価格依存 note、JPY 見積りは出さない", () => {
    const fee = estimateOrderFee(makePair({ taker_fee_rate_quote: 0.0012 }), {
      pair: "btc_jpy",
      side: "buy",
      type: "market",
      amount: "0.02",
    });
    expect(fee).toMatchObject({ role: "taker", rate: 0.0012 });
    expect(fee.estimatedFeeQuote).toBeUndefined();
    expect(fee.estimatedCostQuote).toBeUndefined();
    expect(fee.note).toContain("約定価格依存");
  });

  it("post_only=true の limit → maker 確定 note", () => {
    const fee = estimateOrderFee(makePair({ maker_fee_rate_quote: 0.0001 }), {
      ...LIMIT_BUY,
      postOnly: true,
    });
    expect(fee.role).toBe("maker");
    expect(fee.note).toContain("post_only");
  });

  it("stop_limit(価格既知)は見積りを出し、stop(価格未知)は率のみ", () => {
    const pair = makePair({ maker_fee_rate_quote: 0.0001 });
    const sl = estimateOrderFee(pair, { ...LIMIT_BUY, type: "stop_limit" });
    expect(sl.estimatedFeeQuote).toBe(10);
    const st = estimateOrderFee(pair, {
      pair: "btc_jpy",
      side: "buy",
      type: "stop",
      amount: "0.02",
    });
    expect(st.role).toBe("taker");
    expect(st.estimatedFeeQuote).toBeUndefined();
  });

  it("非 jpy quote は四捨五入しない", () => {
    const pair = makePair({ name: "mona_btc", quote_asset: "btc", maker_fee_rate_quote: 0.001 });
    const fee = estimateOrderFee(pair, {
      pair: "mona_btc",
      side: "buy",
      type: "limit",
      amount: "3",
      price: "0.0001234",
    });
    expect(fee.estimatedFeeQuote).toBeCloseTo(0.0001234 * 3 * 0.001, 12);
  });
});

describe("resolveDryRunFee", () => {
  const seam =
    (pairs: CachedPair[]): (() => Promise<Result<CachedPair[]>>) =>
    async () => ({ success: true, data: pairs });

  it("注入された pairs のライブ率を使う（実 API を叩かない）", async () => {
    const fee = await resolveDryRunFee(
      LIMIT_BUY,
      seam([makePair({ maker_fee_rate_quote: 0.0001 })]),
    );
    expect(fee).toMatchObject({
      role: "maker",
      rate: 0.0001,
      estimatedFeeQuote: 10,
      estimatedCostQuote: 100010,
    });
  });

  it("対象ペアが一覧に無ければ既定フォールバック率＋ note で概算", async () => {
    const fee = await resolveDryRunFee(
      { ...LIMIT_BUY, pair: "doge_jpy" },
      seam([makePair({ name: "btc_jpy" })]),
    );
    expect(fee.rate).toBe(DEFAULT_TAKER_FEE_RATE);
    expect(fee.note).toContain("既定フォールバック率");
  });

  it("pairs 取得失敗でも throw せず default 率＋ note に degrade", async () => {
    const fee = await resolveDryRunFee(LIMIT_BUY, async () => ({
      success: false,
      error: "offline",
    }));
    expect(fee.role).toBe("maker");
    expect(fee.rate).toBe(DEFAULT_TAKER_FEE_RATE);
    expect(fee.note).toContain("既定フォールバック率");
  });
});
