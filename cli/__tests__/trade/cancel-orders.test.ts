// 100行超: cancel-orders の分岐を網羅
import { describe, expect, it, vi } from "vitest";
import { cancelOrders } from "../../commands/trade/cancel-orders.js";
import { TEST_CREDS, mockFetchRaw } from "../test-helpers.js";

describe("cancel-orders", () => {
  it("returns dryRun without --execute", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const result = await cancelOrders({ pair: "btc_jpy", orderIds: "1,2,3" });
    expect(result).toMatchObject({ success: true, data: { dryRun: true } });
    expect(writeSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
  });

  it("calls API with --execute and --confirm", async () => {
    const result = await cancelOrders(
      {
        pair: "btc_jpy",
        orderIds: "1,2",
        execute: true,
        confirm: "I-UNDERSTAND-CANCEL-ORDERS",
      },
      {
        fetch: mockFetchRaw({
          success: 1,
          data: {
            orders: [
              {
                order_id: 1,
                pair: "btc_jpy",
                side: "buy",
                type: "limit",
                price: "5000000",
                status: "CANCELED_UNFILLED",
              },
              {
                order_id: 2,
                pair: "btc_jpy",
                side: "sell",
                type: "limit",
                price: "6000000",
                status: "CANCELED_UNFILLED",
              },
            ],
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
    const fetchSpy = vi.fn(async () => new Response('{"success":1,"data":{"orders":[]}}'));
    const result = await cancelOrders(
      { pair: "btc_jpy", orderIds: "1,2", execute: true },
      { fetch: fetchSpy, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("I-UNDERSTAND-CANCEL-ORDERS");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects --execute with wrong --confirm phrase", async () => {
    const fetchSpy = vi.fn(async () => new Response('{"success":1,"data":{"orders":[]}}'));
    const result = await cancelOrders(
      {
        pair: "btc_jpy",
        orderIds: "1,2",
        execute: true,
        confirm: "I-UNDERSTAND-CANCEL-ORDER",
      },
      { fetch: fetchSpy, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("I-UNDERSTAND-CANCEL-ORDERS");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects more than 30 order IDs", async () => {
    const ids = Array.from({ length: 31 }, (_, i) => i + 1).join(",");
    const result = await cancelOrders({ pair: "btc_jpy", orderIds: ids });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("at most 30");
  });

  it("requires pair", async () => {
    const result = await cancelOrders({ orderIds: "1,2" });
    expect(result.success).toBe(false);
  });

  it("requires order-ids", async () => {
    const result = await cancelOrders({ pair: "btc_jpy" });
    expect(result.success).toBe(false);
  });

  it("rejects empty order-ids string", async () => {
    const result = await cancelOrders({ pair: "btc_jpy", orderIds: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("order-ids is required");
  });

  it("rejects decimal order ids (1.5,2)", async () => {
    const result = await cancelOrders({ pair: "btc_jpy", orderIds: "1.5,2" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("positive integers");
  });

  it("rejects non-numeric order ids (abc)", async () => {
    const result = await cancelOrders({ pair: "btc_jpy", orderIds: "abc" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("positive integers");
  });

  it("accepts whitespace-padded ids", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const result = await cancelOrders({ pair: "btc_jpy", orderIds: "1, 2 ,3" });
    expect(result).toMatchObject({ success: true, data: { dryRun: true } });
    expect(writeSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
  });

  it("rejects 0 in order-ids", async () => {
    const result = await cancelOrders({ pair: "btc_jpy", orderIds: "1,0,3" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("positive integers");
  });

  it("rejects malformed pair (../btc)", async () => {
    const result = await cancelOrders({ pair: "../btc", orderIds: "1,2" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/pair/);
  });
});
