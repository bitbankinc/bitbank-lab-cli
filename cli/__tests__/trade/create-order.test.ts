// 100行超: trade create-order の分岐を網羅
import { describe, expect, it, vi } from "vitest";
import { createOrder } from "../../commands/trade/create-order.js";
import { EXIT } from "../../exit-codes.js";
import { machineOutput } from "../../output.js";
import type { DryRunData } from "../../types.js";
import { captureStdout, mockFetchRaw, mockGetPairsWith, TEST_CREDS } from "../test-helpers.js";

const VALID_RESPONSE = {
  success: 1,
  data: {
    order_id: 123,
    pair: "btc_jpy",
    side: "buy",
    type: "limit",
    start_amount: "0.001",
    remaining_amount: "0.001",
    executed_amount: "0",
    price: "5000000",
    post_only: false,
    average_price: "0",
    ordered_at: 1700000000000,
    expire_at: null,
    status: "UNFILLED",
  },
};

describe("create-order", () => {
  it("returns dryRun when --execute is not set (executeHint carries --execute)", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const result = await createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.001",
    });
    expect(result).toMatchObject({
      success: true,
      data: { dryRun: true, executeHint: expect.stringContaining("--execute") },
    });
    expect(writeSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
  });

  it("calls API when --execute and --confirm are set", async () => {
    const result = await createOrder(
      {
        pair: "btc_jpy",
        side: "buy",
        type: "limit",
        price: "5000000",
        amount: "0.001",
        execute: true,
        confirm: "I-UNDERSTAND-CREATE-ORDER",
      },
      { fetch: mockFetchRaw(VALID_RESPONSE), retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(true);
    if (result.success) expect((result.data as Record<string, unknown>).order_id).toBe(123);
  });

  it("rejects --execute without --confirm (no API call)", async () => {
    const fetchSpy = vi.fn(mockFetchRaw(VALID_RESPONSE));
    const result = await createOrder(
      {
        pair: "btc_jpy",
        side: "buy",
        type: "limit",
        price: "5000000",
        amount: "0.001",
        execute: true,
      },
      { fetch: fetchSpy, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("I-UNDERSTAND-CREATE-ORDER");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects --execute with wrong --confirm phrase (no API call)", async () => {
    const fetchSpy = vi.fn(mockFetchRaw(VALID_RESPONSE));
    const result = await createOrder(
      {
        pair: "btc_jpy",
        side: "buy",
        type: "limit",
        price: "5000000",
        amount: "0.001",
        execute: true,
        confirm: "i-understand-create-order",
      },
      { fetch: fetchSpy, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("I-UNDERSTAND-CREATE-ORDER");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("dry-run result conveys the confirm phrase requirement", async () => {
    const result = await createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.001",
    });
    expect(result).toMatchObject({
      success: true,
      data: {
        dryRun: true,
        confirmPhrase: "I-UNDERSTAND-CREATE-ORDER",
        executeHint: expect.stringContaining("--confirm=I-UNDERSTAND-CREATE-ORDER"),
      },
    });
  });

  it("validates price required for limit order", async () => {
    const result = await createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      amount: "0.001",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("price is required");
  });

  it("validates trigger-price required for stop_limit", async () => {
    const result = await createOrder({
      pair: "btc_jpy",
      side: "sell",
      type: "stop_limit",
      price: "5000000",
      amount: "0.001",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("trigger-price is required");
  });

  it("validates amount > 0", async () => {
    const result = await createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "market",
      amount: "0",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("amount");
  });

  it("rejects amount=Infinity", async () => {
    const result = await createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "market",
      amount: "Infinity",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("positive decimal");
  });

  it("rejects amount in exponent notation (1e308)", async () => {
    const result = await createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "market",
      amount: "1e308",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("positive decimal");
  });

  it("rejects signed amount (+1)", async () => {
    const result = await createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "market",
      amount: "+1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed pair (no underscore)", async () => {
    const result = await createOrder({
      pair: "foo",
      side: "buy",
      type: "market",
      amount: "0.001",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("pair must be like btc_jpy");
  });

  // Regression (QA repro #2): `trade create-order --pair=BTCJPY ...` は pair 形式不正。
  // 入力検証エラーなので exit 4 (PARAM) を返し、検証段階で fetch を叩かない。
  it("rejects bad pair format → exit PARAM, no API call (repro: --pair=BTCJPY)", async () => {
    const fetchSpy = vi.fn(mockFetchRaw(VALID_RESPONSE));
    const result = await createOrder(
      { pair: "BTCJPY", side: "buy", type: "market", amount: "0.001" },
      { fetch: fetchSpy, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("pair must be like btc_jpy");
      expect(result.exitCode).toBe(EXIT.PARAM);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects negative price", async () => {
    const result = await createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "-100",
      amount: "0.001",
    });
    expect(result.success).toBe(false);
  });

  it("rejects price=Infinity", async () => {
    const result = await createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "Infinity",
      amount: "0.001",
    });
    expect(result.success).toBe(false);
  });

  it("validates side enum", async () => {
    const result = await createOrder({
      pair: "btc_jpy",
      side: "invalid",
      type: "market",
      amount: "0.001",
    });
    expect(result.success).toBe(false);
  });

  it("market order does not require price", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const result = await createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "market",
      amount: "0.001",
    });
    expect(result).toMatchObject({ success: true, data: { dryRun: true } });
    expect(writeSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
  });

  it("accepts stop-market response without price field", async () => {
    const stopMarketResponse = {
      success: 1,
      data: {
        order_id: 56675044283,
        pair: "btc_jpy",
        side: "sell",
        type: "stop",
        executed_amount: "0",
        average_price: "0",
        ordered_at: 1700000000000,
        status: "UNFILLED",
      },
    };
    const result = await createOrder(
      {
        pair: "btc_jpy",
        side: "sell",
        type: "stop",
        triggerPrice: "11000000",
        amount: "0.001",
        execute: true,
        confirm: "I-UNDERSTAND-CREATE-ORDER",
      },
      {
        fetch: mockFetchRaw(stopMarketResponse),
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "1",
      },
    );
    expect(result.success).toBe(true);
    if (result.success) expect((result.data as Record<string, unknown>).order_id).toBe(56675044283);
  });
});

// dry-run の手数料見積り。getPairs を注入して実 API を避けつつ、notional=100000
// （5000000*0.02）に対する maker/taker・リベート・campaign 0 を検証する。
describe("create-order dry-run 手数料見積り", () => {
  const makerPairs = (rate: number) =>
    mockGetPairsWith([{ name: "btc_jpy", maker_fee_rate_quote: rate }]);
  const limitBuy = (rate: number) =>
    createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.02",
      getPairs: makerPairs(rate),
    });

  it("limit buy: ライブ maker 率で feeQuote / estimatedCost が出る", async () => {
    const r = await limitBuy(0.0001);
    expect(r).toMatchObject({
      success: true,
      data: {
        dryRun: true,
        fee: { role: "maker", rate: 0.0001, estimatedFeeQuote: 10, estimatedCostQuote: 100010 },
      },
    });
  });

  it("負 maker → リベート（買いコスト減・売り手取り増）", async () => {
    const buy = await limitBuy(-0.0001);
    expect(buy).toMatchObject({
      success: true,
      data: { fee: { estimatedFeeQuote: -10, estimatedCostQuote: 99990 } },
    });
    const sell = await createOrder({
      pair: "btc_jpy",
      side: "sell",
      type: "limit",
      price: "5000000",
      amount: "0.02",
      getPairs: makerPairs(-0.0001),
    });
    expect(sell).toMatchObject({ success: true, data: { fee: { estimatedCostQuote: 100010 } } });
  });

  it("campaign=0 maker rate を維持（default に落ちない）", async () => {
    const r = await limitBuy(0);
    expect(r).toMatchObject({
      success: true,
      data: { fee: { rate: 0, estimatedFeeQuote: 0, estimatedCostQuote: 100000 } },
    });
  });

  it("market: taker 率＋約定価格依存 note、JPY 見積りは出さない", async () => {
    const r = await createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "market",
      amount: "0.02",
      getPairs: mockGetPairsWith([{ name: "btc_jpy", taker_fee_rate_quote: 0.0012 }]),
    });
    expect(r).toMatchObject({ success: true, data: { fee: { role: "taker", rate: 0.0012 } } });
    if (r.success) {
      const fee = (r.data as DryRunData).fee;
      expect(fee?.estimatedFeeQuote).toBeUndefined();
      expect(fee?.note).toContain("約定価格依存");
    }
  });

  it("post_only=true の limit → maker 確定", async () => {
    const r = await createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.02",
      postOnly: true,
      getPairs: makerPairs(0.0001),
    });
    expect(r).toMatchObject({ success: true, data: { fee: { role: "maker" } } });
    if (r.success) expect((r.data as DryRunData).fee?.note).toContain("post_only");
  });

  it("public pairs で率を解決するが private POST は叩かない", async () => {
    const getPairsSpy = vi.fn(makerPairs(0.0001));
    const fetchSpy = vi.fn(mockFetchRaw(VALID_RESPONSE));
    const r = await createOrder(
      {
        pair: "btc_jpy",
        side: "buy",
        type: "limit",
        price: "5000000",
        amount: "0.02",
        getPairs: getPairsSpy,
      },
      { fetch: fetchSpy, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r).toMatchObject({ success: true, data: { dryRun: true, fee: { role: "maker" } } });
    expect(getPairsSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("--machine envelope に fee が載る", async () => {
    const r = await limitBuy(0.0001);
    const cap = captureStdout();
    machineOutput(r);
    cap.restore();
    const env = JSON.parse(cap.read().trim());
    expect(env.success).toBe(true);
    expect(env.data.fee).toMatchObject({
      role: "maker",
      rate: 0.0001,
      estimatedFeeQuote: 10,
      estimatedCostQuote: 100010,
    });
  });
});
