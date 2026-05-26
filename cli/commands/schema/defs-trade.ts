import { type SchemaDef, p } from "./types.js";

const pair = p("string", "Trading pair (e.g. btc_jpy)");
const execute = p("boolean", "Execute for real (default: dry-run)");
const confirm = p("string", "Confirmation phrase (required with --execute, see trading-safety.md)");
const n = { type: "number" };
const s = { type: "string" };
const nn = { type: ["number", "null"] };
const b = { type: "boolean" };

export const tradeSchemas: Record<string, SchemaDef> = {
  "create-order": {
    category: "trade",
    params: {
      pair,
      side: p("string", "Order side", { enum: ["buy", "sell"] }),
      type: p("string", "Order type", { enum: ["limit", "market", "stop", "stop_limit"] }),
      price: p("string", "Price (required for limit/stop_limit)"),
      amount: p("string", "Order amount"),
      "trigger-price": p("string", "Trigger price (required for stop/stop_limit)"),
      "post-only": p("boolean", "Post-only flag"),
      execute,
      confirm,
    },
    output: {
      type: "object",
      properties: {
        order_id: n,
        pair: s,
        side: s,
        type: s,
        start_amount: nn,
        remaining_amount: nn,
        executed_amount: n,
        price: nn,
        post_only: b,
        status: s,
        ordered_at: n,
      },
    },
  },
  "cancel-order": {
    category: "trade",
    params: { pair, "order-id": p("string", "Order ID to cancel"), execute, confirm },
    output: { type: "object", properties: { order_id: n, pair: s, side: s, type: s, status: s } },
  },
  "cancel-orders": {
    category: "trade",
    params: { pair, "order-ids": p("string", "Comma-separated order IDs"), execute, confirm },
    output: {
      type: "array",
      items: { type: "object", properties: { order_id: n, pair: s, status: s } },
    },
  },
  "confirm-deposits": {
    category: "trade",
    params: { id: p("string", "Deposit ID to confirm"), execute, confirm },
    output: { type: "object", properties: { id: n, status: s } },
  },
  "confirm-deposits-all": {
    category: "trade",
    params: { execute, confirm },
    output: { type: "object", properties: { status: s } },
  },
};

export const streamSchemas: Record<string, SchemaDef> = {
  stream: {
    category: "stream",
    params: {
      pair,
      private: p("boolean", "Use private channel (requires auth)"),
      channel: p("string", "Channel name override"),
      filter: p("string", "JSON path filter"),
    },
    output: { type: "object", description: "Real-time event data (varies by channel)" },
  },
};
