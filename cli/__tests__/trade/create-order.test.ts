// 100行超: trade create-order の分岐を網羅
import { describe, expect, it, vi } from "vitest";
import { createOrder } from "../../commands/trade/create-order.js";
import { EXIT } from "../../exit-codes.js";
import { TEST_CREDS, mockFetchRaw } from "../test-helpers.js";

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
  it("returns dryRun when --execute is not set", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const result = await createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.001",
    });
    expect(result).toEqual({ success: true, data: { dryRun: true } });
    const output = writeSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("DRY RUN");
    expect(output).toContain("--execute");
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

  it("dry-run output includes the confirm phrase requirement", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.001",
    });
    const output = writeSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("--confirm=I-UNDERSTAND-CREATE-ORDER");
    writeSpy.mockRestore();
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
    expect(result).toEqual({ success: true, data: { dryRun: true } });
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
