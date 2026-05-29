import { describe, expect, it, vi } from "vitest";
import { createOrder } from "../../../commands/trade/create-order.js";

describe("Chaos T-07: limit order without --price", () => {
  it("rejects limit order missing price", async () => {
    const r = await createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      amount: "0.001",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("price is required");
  });

  it("rejects stop_limit order missing price", async () => {
    const r = await createOrder({
      pair: "btc_jpy",
      side: "sell",
      type: "stop_limit",
      amount: "0.001",
      triggerPrice: "4000000",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("price is required");
  });

  it("rejects stop order missing trigger-price", async () => {
    const r = await createOrder({
      pair: "btc_jpy",
      side: "sell",
      type: "stop",
      amount: "0.001",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("trigger-price is required");
  });
});

describe("Chaos T-08: market order with --price (should be ignored or ok)", () => {
  it("market order with price succeeds as dry-run (price is optional)", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const r = await createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "market",
      price: "5000000",
      amount: "0.001",
    });
    // market order with price should still succeed — price is optional
    expect(r.success).toBe(true);
    spy.mockRestore();
  });

  it("market order without price succeeds as dry-run", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const r = await createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "market",
      amount: "0.001",
    });
    expect(r).toMatchObject({ success: true, data: { dryRun: true } });
    spy.mockRestore();
  });
});
