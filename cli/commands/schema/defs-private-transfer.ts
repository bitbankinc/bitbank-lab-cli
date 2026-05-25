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
      properties: { equity: nn, margin: nn, free_margin: nn, margin_level: nn, pnl: nn },
    },
  },
  "margin-positions": {
    category: "private",
    params: { pair },
    output: {
      type: "array",
      items: {
        type: "object",
        properties: { pair: s, side: s, amount: n, open_price: n, pnl: n },
      },
    },
  },
};
