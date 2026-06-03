import { type SchemaDef, p } from "./types.js";

const asset = p("string", "Asset symbol (e.g. btc)");
const count = p("string", "Max number of results");
const since = p("string", "Start timestamp (Unix ms)");
const end = p("string", "End timestamp (Unix ms)");
const n = { type: "number" };
const s = { type: "string" };
const sn = { type: ["string", "null"] };

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
      items: {
        type: "object",
        properties: { asset: s, amount: n, network: s, txid: s, created_at: n },
      },
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
};
