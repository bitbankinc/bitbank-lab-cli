import type { CommandEntry } from "./handler-types.js";
import { bool, str, valStr } from "./handler-types.js";
import { handler } from "./make-handler.js";

const pnlHandler: CommandEntry["handler"] = async (_a, values, format) => {
  const { paperPnl, formatPnl } = await import("./paper/pnl.js");
  const r = await paperPnl({ pair: valStr(values, "pair") });
  formatPnl(r, format, values.raw === true, values.machine === true);
};

export const paperCommands: Record<string, CommandEntry> = {
  init: {
    description: "Initialize a paper trading account (virtual JPY balance)",
    options: { jpy: str, force: bool() },
    handler: handler("./paper/init.js", "paperInit", (_a, v) => ({
      jpy: valStr(v, "jpy"),
      force: !!v.force,
    })),
  },
  assets: {
    description: "Show paper trading balances (available / locked / total)",
    handler: handler("./paper/assets.js", "paperAssets", () => ({})),
  },
  "create-order": {
    description: "Place a paper order (market or limit)",
    options: {
      pair: str,
      side: str,
      type: str,
      amount: str,
      price: str,
      "refresh-pairs": bool(),
    },
    handler: handler("./paper/create-order.js", "paperCreateOrder", (_a, v) => ({
      pair: valStr(v, "pair"),
      side: valStr(v, "side"),
      type: valStr(v, "type"),
      amount: valStr(v, "amount"),
      price: valStr(v, "price"),
      refreshPairs: v["refresh-pairs"] === true,
    })),
  },
  "active-orders": {
    description: "Show paper open (limit) orders",
    handler: handler("./paper/active-orders.js", "paperActiveOrders", () => ({})),
  },
  "cancel-order": {
    description: "Cancel a paper limit order by id",
    options: { id: str },
    handler: handler("./paper/cancel-order.js", "paperCancelOrder", (_a, v) => ({
      id: valStr(v, "id"),
    })),
  },
  tick: {
    description: "Resolve paper limit fills against recent 1m candles",
    options: { pair: str },
    handler: handler("./paper/tick.js", "paperTick", (_a, v) => ({
      pair: valStr(v, "pair"),
    })),
  },
  "trade-history": {
    description: "Show paper trading execution history",
    handler: handler("./paper/trade-history.js", "paperTradeHistory", () => ({})),
  },
  reset: {
    description: "Reset paper trading state (requires --confirm)",
    options: { confirm: bool() },
    handler: handler("./paper/reset.js", "paperReset", (_a, v) => ({
      confirm: !!v.confirm,
    })),
  },
  pnl: {
    description: "Show paper trading P&L (realized + unrealized, per pair + total)",
    options: { pair: str },
    handler: pnlHandler,
  },
};
