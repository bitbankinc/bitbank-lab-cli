import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelOrder } from "../../../commands/trade/cancel-order.js";
import { cancelOrders } from "../../../commands/trade/cancel-orders.js";
import { confirmDepositsAll } from "../../../commands/trade/confirm-deposits-all.js";
import { confirmDeposits } from "../../../commands/trade/confirm-deposits.js";
import { createOrder } from "../../../commands/trade/create-order.js";

describe("Chaos T-10: no fetch called without --execute", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    fetchSpy.mockClear();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("create-order does not fetch", async () => {
    await createOrder(
      { pair: "btc_jpy", side: "buy", type: "market", amount: "0.001" },
      { fetch: fetchSpy, retries: 0 },
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("cancel-order does not fetch", async () => {
    await cancelOrder({ pair: "btc_jpy", orderId: "123" }, { fetch: fetchSpy, retries: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("cancel-orders does not fetch", async () => {
    await cancelOrders({ pair: "btc_jpy", orderIds: "1,2,3" }, { fetch: fetchSpy, retries: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("confirm-deposits does not fetch", async () => {
    await confirmDeposits({ id: "12345" }, { fetch: fetchSpy, retries: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("confirm-deposits-all does not fetch", async () => {
    await confirmDepositsAll({}, { fetch: fetchSpy, retries: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
