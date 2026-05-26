import type { CommandEntry } from "./handler-types.js";
import { bool, str, valStr } from "./handler-types.js";
import { tradeHandler } from "./make-handler.js";

export const tradeCommands: Record<string, CommandEntry> = {
  "create-order": {
    description: "Create a spot order (dry-run default)",
    options: {
      pair: str,
      side: str,
      type: str,
      price: str,
      amount: str,
      "trigger-price": str,
      "post-only": bool(),
      execute: bool(),
      confirm: str,
    },
    handler: tradeHandler("./trade/create-order.js", "createOrder", (v) => ({
      pair: valStr(v, "pair"),
      side: valStr(v, "side"),
      type: valStr(v, "type"),
      price: valStr(v, "price"),
      amount: valStr(v, "amount"),
      triggerPrice: valStr(v, "trigger-price"),
      postOnly: !!v["post-only"],
      execute: !!v.execute,
      confirm: valStr(v, "confirm"),
    })),
  },
  "cancel-order": {
    description: "Cancel a spot order (dry-run default)",
    options: { pair: str, "order-id": str, execute: bool(), confirm: str },
    handler: tradeHandler("./trade/cancel-order.js", "cancelOrder", (v) => ({
      pair: valStr(v, "pair"),
      orderId: valStr(v, "order-id"),
      execute: !!v.execute,
      confirm: valStr(v, "confirm"),
    })),
  },
  "cancel-orders": {
    description: "Cancel multiple spot orders (dry-run default)",
    options: { pair: str, "order-ids": str, execute: bool(), confirm: str },
    handler: tradeHandler("./trade/cancel-orders.js", "cancelOrders", (v) => ({
      pair: valStr(v, "pair"),
      orderIds: valStr(v, "order-ids"),
      execute: !!v.execute,
      confirm: valStr(v, "confirm"),
    })),
  },
  "confirm-deposits": {
    description: "Confirm a deposit (dry-run default)",
    options: { id: str, execute: bool(), confirm: str },
    handler: tradeHandler("./trade/confirm-deposits.js", "confirmDeposits", (v) => ({
      id: valStr(v, "id"),
      execute: !!v.execute,
      confirm: valStr(v, "confirm"),
    })),
  },
  "confirm-deposits-all": {
    description: "Confirm all deposits (dry-run default)",
    options: { execute: bool(), confirm: str },
    handler: tradeHandler("./trade/confirm-deposits-all.js", "confirmDepositsAll", (v) => ({
      execute: !!v.execute,
      confirm: valStr(v, "confirm"),
    })),
  },
};
