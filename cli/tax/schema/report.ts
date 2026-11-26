// 100行超: tax コマンドの出力契約を 1 箇所に集約している（reconcile / pnl）。
// 契約どうしは部品を共有する（ReconciliationRow / PendingRow）ので、分けると
// どちらが単一ソースか分からなくなる。
//
// レポート出力型（v2 §1.2 の「ガード成立時のみ参考損益」を型で表す）。
// `reference` が optional なのが本質: **ガードが通らない銘柄では欄そのものが存在しない**。
// 0 や null を入れると「損益ゼロ」と読めてしまうため、欄を出さないことで区別する。
import { z } from "zod";
import { Method } from "./method.js";
import { NtaCompat } from "./nta.js";
import { decStr } from "./primitives.js";
import { Taxation } from "./taxation.js";

/** 取引集計。ガードの成否に関係なく常に出す（年間取引報告書相当のデータ）。 */
export const CurrencySummary = z.object({
  acquired_qty: decStr,
  acquired_cost_jpy: decStr,
  disposed_qty: decStr,
  proceeds_jpy: decStr,
  income_jpy: decStr, // リベート収入・信用差益（銘柄別・JPY）
  expense_jpy: decStr, // 売却手数料・信用差損（銘柄別・JPY）
});

/** 参考損益。ガード(a)〜(d) がすべて成立した銘柄にだけ付く。 */
export const ReferencePnl = z.object({
  unit_price_jpy: decStr,
  cogs_jpy: decStr,
  closing_qty: decStr,
  closing_cost_jpy: decStr,
  revenue_total_jpy: decStr,
  expense_total_jpy: decStr,
  reference_pnl_jpy: decStr, // 負値のまま出す（max(0,·) に丸めない。v2 §9）
});

export const CurrencyReport = z
  .object({
    currency: z.string(),
    method: Method,
    summary: CurrencySummary,
    reference: ReferencePnl.optional(),
    /** 国税庁計算書と同値の出力（付録D.6）。`reference` と同条件でだけ付く */
    nta_compat: NtaCompat.optional(),
    blocked_by: z.array(z.string()),
    warnings: z.array(z.string()),
    policy_ids: z.array(z.string()),
  })
  // ガードが止めた銘柄に互換値だけ出ると「本体は出せないがこちらは出せる」と読める。
  // 出力側は同じ分岐で両方付けているので、契約としても片方だけを許さない
  .superRefine((v, ctx) => {
    if ((v.reference === undefined) !== (v.nta_compat === undefined)) {
      ctx.addIssue({
        code: "custom",
        message: "reference と nta_compat は同時に出すか、同時に出さないかのどちらか",
      });
    }
  });

/** 突合の診断（付録E.4）。`compare-parts.ts` の Diagnosis はこの enum から導出する。 */
export const Diagnosis = z.enum([
  "MATCH",
  "MISSING_ACQUISITION",
  "MISSING_DISPOSAL",
  "UNRECONCILABLE",
  "UNREADABLE",
]);

export const ReconciliationRow = z.object({
  currency: z.string(),
  theoretical: decStr,
  actual: decStr,
  residual: decStr,
  /** この資産に適用したダスト閾値。JPY は円未満を無視するので通貨で異なる */
  dust: decStr,
  within_dust: z.boolean(),
  diagnosis: Diagnosis,
  hint: z.string(),
});

/** 取り込めなかった行（NFR 堅牢性: 未知は警告して保留リストへ）。 */
export const PendingRow = z.object({ source_ref: z.string(), reason: z.string() });

/** `bitbank tax reconcile` の出力契約。 */
export const ReconciliationReport = z.object({
  /** 全体既定。実際に適用した値は行ごとの `dust`（JPY は円未満を無視する） */
  dust_threshold: decStr,
  rows: z.array(ReconciliationRow),
  /** 突合不能（非 JPY クォートを含む）資産 */
  unreconcilable: z.array(z.string()),
  problems: z.array(z.string()),
  warnings: z.array(z.string()),
  pending: z.array(PendingRow),
  counts: z.object({ events: z.number().int(), pending: z.number().int() }),
});

export const TaxReport = z.object({
  year_jst: z.number().int(),
  method: Method,
  /** 適用した課税方式。数値の意味（損益通算の範囲・繰越・税率）を固定するため常に出す */
  taxation: Taxation,
  attested: z.boolean(),
  /**
   * 取込サマリー。**フィールドごとに集計スコープが違う**ので構造で分ける。
   * 収集は全履歴で行い（残高突合＝ガード(d) が全履歴でしか成立しない）、仕訳化は
   * 当年分だけに絞るため、件数は必ず食い違う。混ぜると差を「取込漏れ」と誤読させる。
   */
  source: z.object({
    /** 当年（`year_jst`）に絞ったあとの件数 */
    year: z.object({
      events: z.number().int(),
      deferred: z.number().int(),
    }),
    /** 年で絞る前、全履歴の取込で観測した件数 */
    full_history: z.object({
      pending: z.number().int(),
      deduped: z.number().int(),
      truncated: z.boolean(),
    }),
  }),
  currencies: z.array(CurrencyReport),
  reconciliation: z.array(ReconciliationRow),
  pending: z.array(PendingRow),
  warnings: z.array(z.string()),
  disclaimers: z.array(z.string()),
});

export type Diagnosis = z.infer<typeof Diagnosis>;
export type CurrencySummary = z.infer<typeof CurrencySummary>;
export type ReferencePnl = z.infer<typeof ReferencePnl>;
export type CurrencyReport = z.infer<typeof CurrencyReport>;
export type ReconciliationRow = z.infer<typeof ReconciliationRow>;
export type PendingRow = z.infer<typeof PendingRow>;
export type ReconciliationReport = z.infer<typeof ReconciliationReport>;
export type TaxReport = z.infer<typeof TaxReport>;
