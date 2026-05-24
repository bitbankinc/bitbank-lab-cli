import { describe, expect, it, vi } from "vitest";
import { cancelOrder } from "../../../commands/trade/cancel-order.js";
import { cancelOrders } from "../../../commands/trade/cancel-orders.js";
import { confirmDepositsAll } from "../../../commands/trade/confirm-deposits-all.js";
import { confirmDeposits } from "../../../commands/trade/confirm-deposits.js";
import { createOrder } from "../../../commands/trade/create-order.js";

describe("Chaos T-01: all trade commands return dryRun without --execute", () => {
  it("create-order dry-run returns { dryRun: true } and prints DRY RUN", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const r = await createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.001",
    });
    expect(r).toEqual({ success: true, data: { dryRun: true } });
    const out = spy.mock.calls.map((c) => c[0]).join("");
    expect(out).toContain("DRY RUN");
    expect(out).toContain("--execute");
    spy.mockRestore();
  });

  it("cancel-order dry-run", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const r = await cancelOrder({ pair: "btc_jpy", orderId: "999" });
    expect(r).toEqual({ success: true, data: { dryRun: true } });
    expect(spy.mock.calls.map((c) => c[0]).join("")).toContain("DRY RUN");
    spy.mockRestore();
  });

  it("cancel-orders dry-run", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const r = await cancelOrders({ pair: "btc_jpy", orderIds: "1,2" });
    expect(r).toEqual({ success: true, data: { dryRun: true } });
    expect(spy.mock.calls.map((c) => c[0]).join("")).toContain("DRY RUN");
    spy.mockRestore();
  });

  it("confirm-deposits dry-run", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const r = await confirmDeposits({ id: "12345" });
    expect(r).toEqual({ success: true, data: { dryRun: true } });
    expect(spy.mock.calls.map((c) => c[0]).join("")).toContain("DRY RUN");
    spy.mockRestore();
  });

  it("confirm-deposits-all dry-run", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const r = await confirmDepositsAll({});
    expect(r).toEqual({ success: true, data: { dryRun: true } });
    expect(spy.mock.calls.map((c) => c[0]).join("")).toContain("DRY RUN");
    spy.mockRestore();
  });
});
