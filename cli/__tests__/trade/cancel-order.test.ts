import { describe, expect, it, vi } from "vitest";
import { cancelOrder } from "../../commands/trade/cancel-order.js";
import { EXIT } from "../../exit-codes.js";
import { TEST_CREDS, mockFetchRaw } from "../test-helpers.js";

describe("cancel-order", () => {
  it("returns dryRun without --execute", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const result = await cancelOrder({ pair: "btc_jpy", orderId: "123" });
    expect(result).toEqual({ success: true, data: { dryRun: true } });
    const output = writeSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("DRY RUN");
    writeSpy.mockRestore();
  });

  it("calls API with --execute and --confirm", async () => {
    const result = await cancelOrder(
      {
        pair: "btc_jpy",
        orderId: "123",
        execute: true,
        confirm: "I-UNDERSTAND-CANCEL-ORDER",
      },
      {
        fetch: mockFetchRaw({
          success: 1,
          data: {
            order_id: 123,
            pair: "btc_jpy",
            side: "buy",
            type: "limit",
            price: "5000000",
            status: "CANCELED_UNFILLED",
          },
        }),
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "1",
      },
    );
    expect(result.success).toBe(true);
  });

  it("rejects --execute without --confirm (no API call)", async () => {
    const fetchSpy = vi.fn(async () => new Response('{"success":1,"data":{}}'));
    const result = await cancelOrder(
      { pair: "btc_jpy", orderId: "123", execute: true },
      { fetch: fetchSpy, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("I-UNDERSTAND-CANCEL-ORDER");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects --execute with wrong --confirm phrase", async () => {
    const fetchSpy = vi.fn(async () => new Response('{"success":1,"data":{}}'));
    const result = await cancelOrder(
      { pair: "btc_jpy", orderId: "123", execute: true, confirm: "wrong" },
      { fetch: fetchSpy, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("I-UNDERSTAND-CANCEL-ORDER");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Regression (QA repro #1): `trade cancel-order --order-id=123` (pair 欠落) は
  // 入力検証エラー。bot のリトライ判断が誤らないよう exit 4 (PARAM) で返し、
  // 検証段階で fetch を一切叩かない。
  it("requires pair → exit PARAM, no API call (repro: cancel-order --order-id=123)", async () => {
    const fetchSpy = vi.fn(mockFetchRaw({ success: 1, data: {} }));
    const result = await cancelOrder(
      { orderId: "123" },
      { fetch: fetchSpy, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result).toEqual({
      success: false,
      error: "pair is required. Example: --pair=btc_jpy",
      exitCode: EXIT.PARAM,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("requires order-id → exit PARAM", async () => {
    const result = await cancelOrder({ pair: "btc_jpy" });
    expect(result).toEqual({
      success: false,
      error: "id is required. Example: --id=12345",
      exitCode: EXIT.PARAM,
    });
  });

  it("rejects pair format mismatch (no underscore)", async () => {
    const result = await cancelOrder({ pair: "btcjpy", orderId: "123" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("pair must be like btc_jpy");
  });

  it("rejects order-id=0", async () => {
    const result = await cancelOrder({ pair: "btc_jpy", orderId: "0" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("id must be a positive integer");
  });

  it("rejects non-numeric order-id", async () => {
    const result = await cancelOrder({ pair: "btc_jpy", orderId: "abc" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("id must be a positive integer");
  });
});
