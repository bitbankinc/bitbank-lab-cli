import { p, type SchemaDef } from "./types.js";

const pair = p("string", "Trading pair (e.g. btc_jpy)");
const n = { type: "number" };
const s = { type: "string" };
const nn = { type: ["number", "null"] };

const tickerOutput = {
  type: "object",
  properties: { sell: nn, buy: nn, high: nn, low: nn, open: nn, last: nn, vol: nn, timestamp: n },
};

const tickerArrayOutput = {
  type: "array",
  items: {
    type: "object",
    properties: { pair: s, sell: nn, buy: nn, high: nn, low: nn, last: nn, vol: nn, timestamp: n },
  },
};

export const publicMarketSchemas: Record<string, SchemaDef> = {
  ticker: { category: "public", params: { pair }, output: tickerOutput },
  tickers: { category: "public", params: {}, output: tickerArrayOutput },
  "tickers-jpy": { category: "public", params: {}, output: tickerArrayOutput },
  depth: {
    category: "public",
    params: { pair },
    output: {
      type: "object",
      properties: {
        asks: { type: "array", items: { type: "array", items: n } },
        bids: { type: "array", items: { type: "array", items: n } },
        timestamp: n,
      },
    },
  },
  transactions: {
    category: "public",
    params: { pair, date: p("string", "Date filter (YYYYMMDD)") },
    output: {
      type: "array",
      items: {
        type: "object",
        properties: { transaction_id: n, side: s, price: n, amount: n, executed_at: n },
      },
    },
  },
};
