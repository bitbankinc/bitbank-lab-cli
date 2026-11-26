// paper の信用（ADR-010）のコマンド。paper-handlers.ts の paperCommands に展開される。
import type { CommandEntry } from "./handler-types.js";
import { str, valStr } from "./handler-types.js";
import { handler } from "./make-handler.js";

export const paperMarginCommands: Record<string, CommandEntry> = {
  "create-margin-order": {
    description: "Place a paper margin order (open/close by side × position-side; market or limit)",
    options: {
      pair: str,
      side: str,
      "position-side": str,
      type: str,
      amount: str,
      price: str,
      intent: str,
    },
    handler: handler("./paper/create-margin-order.js", "paperCreateMarginOrder", (_a, v) => ({
      pair: valStr(v, "pair"),
      side: valStr(v, "side"),
      positionSide: valStr(v, "position-side"),
      type: valStr(v, "type"),
      amount: valStr(v, "amount"),
      price: valStr(v, "price"),
      intent: valStr(v, "intent"),
    })),
  },
  "margin-status": {
    description:
      "Show the paper margin account (margin ratio, required margin, capacity; with assumptions)",
    handler: handler("./paper/margin-status.js", "paperMarginStatus", () => ({})),
  },
  "margin-positions": {
    description:
      "Show paper margin positions (locked amount, unrealized fee/interest/PnL; margin call notice)",
    options: { pair: str },
    handler: handler("./paper/margin-positions.js", "paperMarginPositions", (_a, v) => ({
      pair: valStr(v, "pair"),
    })),
  },
};
