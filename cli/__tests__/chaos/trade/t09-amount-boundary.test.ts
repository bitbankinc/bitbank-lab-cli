import { describe, expect, it } from "vitest";
import { createOrder } from "../../../commands/trade/create-order.js";

describe("Chaos T-09: create-order --amount boundary values", () => {
  it("rejects amount = 0", async () => {
    const r = await createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "market",
      amount: "0",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("amount must be > 0");
  });

  it("rejects negative amount", async () => {
    const r = await createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "market",
      amount: "-1",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("amount must be > 0");
  });

  it("rejects non-numeric amount", async () => {
    const r = await createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "market",
      amount: "abc",
    });
    expect(r.success).toBe(false);
  });

  it("accepts very small positive amount (dry-run)", async () => {
    const { vi } = await import("vitest");
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const r = await createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "market",
      amount: "0.00000001",
    });
    expect(r.success).toBe(true);
    spy.mockRestore();
  });
});
