import type { CommandEntry } from "./handler-types.js";
import { bool, str, valStr } from "./handler-types.js";
import { handler } from "./make-handler.js";

export const privateCommands: Record<string, CommandEntry> = {
  assets: {
    description: "Get your asset balances",
    options: { all: bool() },
    handler: handler("./private/assets.js", "assets", (_a, v) => ({ showAll: !!v.all })),
  },
  order: {
    description: "Get a specific order",
    options: { pair: str, "order-id": str },
    handler: handler("./private/order.js", "order", (_a, v) => ({
      pair: valStr(v, "pair"),
      orderId: valStr(v, "order-id"),
    })),
  },
  "orders-info": {
    description: "Get multiple orders by IDs",
    options: { pair: str, "order-ids": str },
    handler: handler("./private/orders-info.js", "ordersInfo", (_a, v) => ({
      pair: valStr(v, "pair"),
      orderIds: valStr(v, "order-ids"),
    })),
  },
  "active-orders": {
    description: "Get active (open) orders",
    options: { pair: str, count: str, since: str, end: str },
    handler: handler("./private/active-orders.js", "activeOrders", (_a, v) => ({
      pair: valStr(v, "pair"),
      count: valStr(v, "count"),
      since: valStr(v, "since"),
      end: valStr(v, "end"),
    })),
  },
  "trade-history": {
    description: "Get trade execution history",
    options: {
      pair: str,
      count: str,
      "order-id": str,
      since: str,
      end: str,
      order: str,
      all: bool(),
      "max-pages": str,
    },
    handler: handler("./private/trade-history.js", "tradeHistoryDispatch", (_a, v) => ({
      pair: valStr(v, "pair"),
      count: valStr(v, "count"),
      orderId: valStr(v, "order-id"),
      since: valStr(v, "since"),
      end: valStr(v, "end"),
      order: valStr(v, "order"),
      all: !!v.all,
      maxPages: valStr(v, "max-pages"),
    })),
  },
  "trade-history-all": {
    description: "Get all trade history (paginated; default cap 1000 pages)",
    options: { pair: str, since: str, end: str, "max-pages": str },
    handler: handler("./private/trade-history-all.js", "tradeHistoryAll", (_a, v) => ({
      pair: valStr(v, "pair"),
      since: valStr(v, "since"),
      end: valStr(v, "end"),
      maxPages: valStr(v, "max-pages"),
    })),
  },
  "margin-status": {
    description: "Get margin account status",
    handler: handler("./private/margin-status.js", "marginStatus", () => ({})),
  },
  "margin-positions": {
    description: "Get open margin positions",
    options: { pair: str },
    handler: handler("./private/margin-positions.js", "marginPositions", (_a, v) => ({
      pair: valStr(v, "pair"),
    })),
  },
};
