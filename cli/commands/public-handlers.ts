import type { CommandEntry } from "./handler-types.js";
import { str, valStr } from "./handler-types.js";
import { handler } from "./make-handler.js";

export const publicCommands: Record<string, CommandEntry> = {
  ticker: {
    description: "Get ticker for a pair (e.g. btc_jpy)",
    options: { pair: str },
    handler: handler("./public/ticker.js", "ticker", (a, v) => ({
      pair: valStr(v, "pair") ?? a[0],
    })),
  },
  tickers: {
    description: "Get tickers for all pairs",
    handler: handler("./public/tickers.js", "tickers", () => ({})),
  },
  "tickers-jpy": {
    description: "Get tickers for all JPY pairs",
    handler: handler("./public/tickers.js", "tickersJpy", () => ({})),
  },
  depth: {
    description: "Get order book depth for a pair",
    options: { pair: str },
    handler: handler("./public/depth.js", "depth", (a, v) => ({ pair: valStr(v, "pair") ?? a[0] })),
  },
  transactions: {
    description: "Get recent transactions for a pair",
    options: { pair: str, date: str },
    handler: handler("./public/transactions.js", "transactions", (a, v) => ({
      pair: valStr(v, "pair") ?? a[0],
      date: valStr(v, "date"),
    })),
  },
  candles: {
    description: "Get candlestick OHLCV data",
    options: {
      pair: str,
      type: str,
      date: str,
      limit: str,
      from: str,
      to: str,
      "no-cache": { type: "boolean", default: false },
    },
    handler: handler("./public/candles.js", "candles", (a, v) => ({
      pair: valStr(v, "pair") ?? a[0],
      type: valStr(v, "type"),
      date: valStr(v, "date"),
      limit: v.limit !== undefined ? Number(v.limit) : undefined,
      from: valStr(v, "from"),
      to: valStr(v, "to"),
      noCache: v["no-cache"] === true,
    })),
  },
  "circuit-break": {
    description: "Get circuit breaker info for a pair",
    options: { pair: str },
    handler: handler("./public/circuit-break.js", "circuitBreak", (a, v) => ({
      pair: valStr(v, "pair") ?? a[0],
    })),
  },
  status: {
    description: "Get exchange status for all pairs",
    handler: handler("./public/status.js", "status", () => ({})),
  },
  pairs: {
    description: "Get all pair settings",
    handler: handler("./public/pairs.js", "pairs", () => ({})),
  },
};
