// 仕訳（v2 §13.3）。Event から派生させる別型で、平均法エンジンの入力になる。
// 変換規則の単一ソースは v2 付録A の表（ledger/from-events.ts が実装する）。
// kind ごとの必須項目は superRefine で強制する（コメント依存にしない）。
import { z } from "zod";
import { decStr } from "./primitives.js";

export const LedgerKind = z.enum(["ACQUIRE", "DISPOSE", "INCOME", "EXPENSE"]);
export type LedgerKind = z.infer<typeof LedgerKind>;

const LedgerEntryBase = z.object({
  event_id: z.string(),
  seq: z.number().int(), // 同一 event 由来の複数仕訳を安定順序化
  kind: LedgerKind,
  currency: z.string(),
  year_jst: z.number().int(),
  ts_utc: z.number().int(),
  sort_key: z.string(), // (ts_utc, source_ref) の安定ソート用
  qty: decStr, // 全 kind で必須。INCOME/EXPENSE は数量を伴わないので "0"
  cost_jpy: decStr.optional(), // ACQUIRE: 取得価額（購入手数料込み）
  proceeds_jpy: decStr.optional(), // DISPOSE: 譲渡価額
  amount_jpy: decStr.optional(), // INCOME/EXPENSE
  category: z.string(), // "rebate_income" / "expense_fee" / "margin_gain" / "margin_fee" 等
  policy_ids: z.array(z.string()), // 適用した【方針】ID（P-04 等）をレポートに露出
});

/** kind ごとに「どの金額欄が要るか」を 1 箇所で定義する。 */
const REQUIRED_AMOUNT = {
  ACQUIRE: "cost_jpy",
  DISPOSE: "proceeds_jpy",
  INCOME: "amount_jpy",
  EXPENSE: "amount_jpy",
} as const satisfies Record<LedgerKind, "cost_jpy" | "proceeds_jpy" | "amount_jpy">;

const ALL_AMOUNTS = ["cost_jpy", "proceeds_jpy", "amount_jpy"] as const;

export const LedgerEntry = LedgerEntryBase.superRefine((e, ctx) => {
  const required = REQUIRED_AMOUNT[e.kind];
  if (e[required] === undefined) {
    ctx.addIssue({
      code: "custom",
      path: [required],
      message: `${e.kind} は ${required} が必須`,
    });
  }
  // 別 kind の金額欄が埋まっているのは変換ミス。黙って無視すると集計から落ちる
  for (const field of ALL_AMOUNTS) {
    if (field !== required && e[field] !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: [field],
        message: `${e.kind} に ${field} は付かない（${required} を使う）`,
      });
    }
  }
});
export type LedgerEntry = z.infer<typeof LedgerEntry>;
