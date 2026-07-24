// 100行超: private transfer 系（deposit / withdrawal）エンドポイントの
// output スキーマ定義を 1 ファイルに集約しているため。withdrawal-history の
// crypto/fiat 両対応フィールド拡張（ISSUE-E）で増加した。各 def は宣言的な
// レジストリで分割は不自然なため、行数より凝集を優先する。
import { p, type SchemaDef } from "./types.js";

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
    params: {
      asset,
      count,
      since,
      end,
      all: p("boolean", "Fetch all pages (auto-paginate; default cap 1000 pages)"),
      year: p("string", "JST tax year (YYYY); implies --all, filters to JST 1/1–12/31"),
      "max-pages": p("string", "Max pages to fetch with --all/--year (default: 1000; positive integer)"),
    },
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
        properties: {
          // 常時（crypto / fiat 共通）
          uuid: s,
          asset: s,
          account_uuid: s,
          amount: n,
          fee: n,
          status: s,
          requested_at: n,
          // crypto 出金のみ（fiat では欠落 or null）
          label: sn,
          address: sn,
          network: sn,
          destination_tag: { type: ["number", "string", "null"] },
          txid: sn,
          // fiat（jpy）出金のみ（crypto では欠落 or null）
          bank_name: sn,
          branch_name: sn,
          account_type: sn,
          account_number: sn,
          account_owner: sn,
        },
      },
    },
  },
};
