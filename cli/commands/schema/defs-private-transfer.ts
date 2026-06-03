import { type SchemaDef, p } from "./types.js";

const asset = p("string", "Asset symbol (e.g. btc)");
const pair = p("string", "Trading pair (e.g. btc_jpy)");
const count = p("string", "Max number of results");
const since = p("string", "Start timestamp (Unix ms)");
const end = p("string", "End timestamp (Unix ms)");
const n = { type: "number" };
const s = { type: "string" };
const sn = { type: ["string", "null"] };
const nn = { type: ["number", "null"] };

export const privateTransferSchemas: Record<string, SchemaDef> = {
  "deposit-history": {
    category: "private",
    params: { asset, count, since, end },
    output: {
      type: "array",
      items: {
        type: "object",
        properties: { asset: s, amount: n, txid: sn, status: s, found_at: n },
      },
    },
  },
  "unconfirmed-deposits": {
    category: "private",
    params: { asset },
    output: {
      type: "array",
      items: { type: "object", properties: { asset: s, amount: n, txid: s, found_at: n } },
    },
  },
  "deposit-originators": {
    category: "private",
    params: { asset },
    output: {
      type: "array",
      items: { type: "object", properties: { originator_label: s, originator_address: s } },
    },
  },
  "withdrawal-accounts": {
    category: "private",
    params: { asset },
    output: {
      type: "array",
      items: { type: "object", properties: { uuid: s, label: s, address: s } },
    },
  },
  "withdrawal-history": {
    category: "private",
    params: { asset, count, since, end },
    output: {
      type: "array",
      items: {
        type: "object",
        properties: { asset: s, amount: n, fee: n, txid: sn, status: s, requested_at: n },
      },
    },
  },
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
      },
    },
  },
  "margin-positions": {
    category: "private",
    params: { pair },
    output: {
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
  },
};
