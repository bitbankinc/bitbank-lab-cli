import { describe, expect, it, vi } from "vitest";
import { cancelOrder } from "../../../commands/trade/cancel-order.js";
import { cancelOrders } from "../../../commands/trade/cancel-orders.js";
import { confirmDeposits } from "../../../commands/trade/confirm-deposits.js";
import { confirmDepositsAll } from "../../../commands/trade/confirm-deposits-all.js";
import { createOrder } from "../../../commands/trade/create-order.js";

// dry-run の描画は出力層 (output.ts / output-dry-run.ts) の責務に移った。
// コマンドは副作用なく構造化データ ({ dryRun: true, ... }) を返すことを担保する。
describe("Chaos T-01: all trade commands return dryRun (no execution) without --execute", () => {
  it("create-order dry-run returns structured data and does not print", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const r = await createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.001",
    });
    expect(r).toMatchObject({
      success: true,
      data: { dryRun: true, executeHint: expect.stringContaining("--execute") },
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("cancel-order dry-run", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const r = await cancelOrder({ pair: "btc_jpy", orderId: "999" });
    expect(r).toMatchObject({ success: true, data: { dryRun: true } });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("cancel-orders dry-run", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const r = await cancelOrders({ pair: "btc_jpy", orderIds: "1,2" });
    expect(r).toMatchObject({ success: true, data: { dryRun: true } });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("confirm-deposits dry-run", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const r = await confirmDeposits({
      deposits: "11111111-2222-3333-4444-555555555555:99999999-8888-7777-6666-555555555555",
    });
    expect(r).toMatchObject({ success: true, data: { dryRun: true } });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("confirm-deposits-all dry-run", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const r = await confirmDepositsAll({ originatorUuid: "99999999-8888-7777-6666-555555555555" });
    expect(r).toMatchObject({ success: true, data: { dryRun: true } });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
