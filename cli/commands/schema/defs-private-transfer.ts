import { type SchemaDef, p } from "./types.js";

const asset = p("string", "Asset symbol (e.g. btc)");
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
        properties: {
          uuid: s,
          asset: s,
          amount: n,
          network: s,
          address: s,
          txid: sn,
          status: s,
          found_at: n,
          confirmed_at: nn,
        },
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
        properties: { uuid: s, asset: s, amount: n, network: s, txid: sn, created_at: n },
      },
    },
  },
  "deposit-originators": {
    category: "private",
    // docs の Parameters は None。params なし。
    params: {},
    output: {
      type: "array",
      items: {
        type: "object",
        properties: {
          uuid: s,
          label: s,
          deposit_type: s,
          deposit_purpose: sn,
          originator_status: s,
          originator_type: s,
          originator_last_name: sn,
          originator_first_name: sn,
          originator_country: sn,
          originator_prefecture: sn,
          originator_city: sn,
          originator_address: sn,
          originator_building: sn,
          originator_company_name: sn,
          originator_company_type: sn,
          originator_company_type_position: sn,
          originator_substantial_controllers: {
            type: "array",
            items: {
              type: "object",
              properties: { uuid: s, name: s, country: s, prefecture: sn },
            },
          },
        },
      },
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
