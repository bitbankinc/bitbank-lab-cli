import { type SchemaDef, p } from "./types.js";

const pair = p("string", "Trading pair (e.g. btc_jpy)");
const count = p("string", "Max number of results");
const since = p("string", "Start timestamp (Unix ms)");
const end = p("string", "End timestamp (Unix ms)");
const n = { type: "number" };
const s = { type: "string" };
const nn = { type: ["number", "null"] };

const orderProps = {
  order_id: n,
  pair: s,
  side: s,
  type: s,
  price: nn,
  start_amount: nn,
  remaining_amount: nn,
  executed_amount: n,
  status: s,
};

export const privateAccountSchemas: Record<string, SchemaDef> = {
  assets: {
    category: "private",
    params: { all: p("boolean", "Include zero-balance assets") },
    output: {
      type: "array",
      items: {
        type: "object",
        properties: {
          asset: s,
          free_amount: n,
          locked_amount: n,
          onhand_amount: n,
          withdrawing_amount: n,
        },
      },
    },
  },
  order: {
    category: "private",
    params: { pair, "order-id": p("string", "Order ID to look up") },
    output: { type: "object", properties: { ...orderProps, ordered_at: n } },
  },
  "orders-info": {
    category: "private",
    params: { pair, "order-ids": p("string", "Comma-separated order IDs") },
    output: {
      type: "array",
      items: { type: "object", properties: { order_id: n, pair: s, side: s, type: s, status: s } },
    },
  },
  "active-orders": {
    category: "private",
    params: { pair, count, since, end },
    output: { type: "array", items: { type: "object", properties: orderProps } },
  },
  "trade-history": {
    category: "private",
    params: { pair, count, since, end, order: p("string", "Sort order (asc/desc)") },
    output: {
      type: "array",
      items: {
        type: "object",
        properties: {
          trade_id: n,
          pair: s,
          side: s,
          type: s,
          amount: n,
          price: n,
          fee_amount_base: n,
          fee_amount_quote: n,
          executed_at: n,
        },
      },
    },
  },
  "trade-history-all": {
    category: "private",
    params: {
      pair,
      since,
      end,
      "max-pages": p("string", "Max pages to fetch (default: 1000; positive integer)"),
    },
    output: {
      type: "array",
      items: {
        type: "object",
        properties: { trade_id: n, pair: s, side: s, amount: n, price: n, executed_at: n },
      },
    },
  },
};
