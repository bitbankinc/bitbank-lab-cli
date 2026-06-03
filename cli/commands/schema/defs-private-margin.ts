import { type SchemaDef, p } from "./types.js";

const pair = p("string", "Trading pair (e.g. btc_jpy)");
const n = { type: "number" };
const s = { type: "string" };
const sn = { type: ["string", "null"] };
const nn = { type: ["number", "null"] };

export const privateMarginSchemas: Record<string, SchemaDef> = {
  "margin-status": {
    category: "private",
    params: {},
    output: {
      type: "object",
      properties: {
        status: s,
        total_margin_balance: n,
        total_margin_balance_percentage: nn,
        margin_position_profit_loss: n,
        margin_call_percentage: nn,
        losscut_percentage: nn,
        buy_credit: n,
        sell_credit: n,
        unrealized_cost: n,
        total_margin_position_product: n,
        open_margin_position_product: n,
        open_margin_order_product: n,
        total_position_maintenance_margin: n,
        total_long_position_maintenance_margin: n,
        total_short_position_maintenance_margin: n,
        total_open_order_maintenance_margin: n,
        total_long_open_order_maintenance_margin: n,
        total_short_open_order_maintenance_margin: n,
        available_balances: {
          type: "array",
          items: { type: "object", properties: { pair: s, long: n, short: n } },
        },
      },
    },
  },
  "margin-positions": {
    category: "private",
    params: { pair },
    output: {
      type: "object",
      properties: {
        notice: {
          type: ["object", "null"],
          properties: { what: sn, occurred_at: nn, amount: nn, due_date_at: nn },
        },
        payables: { type: "object", properties: { amount: n } },
        positions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              pair: s,
              position_side: s,
              open_amount: n,
              product: n,
              average_price: n,
              unrealized_fee_amount: n,
              unrealized_interest_amount: n,
            },
          },
        },
        losscut_threshold: { type: "object", properties: { individual: n, company: n } },
      },
    },
  },
};
