// /spot/pairs の信用取引フィールド（ADR-010 / docs/dev/paper-margin-plan.md §2.1）。
// API スキーマ（commands/public/pairs.ts）と pairs キャッシュ（pairs-cache.ts）と
// schema カタログ（commands/schema/defs-public-data.ts）が同じキー集合を使うため、
// キーの一覧と、それぞれの表現での型をここに 1 つだけ置く。
//
// 信用非対応ペアでは各値が null で返る（2026-07-25 採取の生レスポンスで、btc / xrp / eth /
// sol / doge だけが非 null）。フィールドごと欠けても現物の経路（paper の数量検証・dry-run の
// 手数料見積り）を壊さないよう optional にし、欠落（undefined = 不明）と null（非対応）を
// 区別したまま残す。どちらをどう扱うかは利用側（paper-margin/params.ts）が決める。
import { z } from "zod";
import { nullableNumStr } from "./schema-helpers.js";

/** 率（API では文字列 | null）。手数料率は負（リベート）もあり得る。利息率は「/日」。 */
export const MARGIN_RATE_KEYS = [
  "margin_open_maker_fee_rate_quote",
  "margin_open_taker_fee_rate_quote",
  "margin_close_maker_fee_rate_quote",
  "margin_close_taker_fee_rate_quote",
  "margin_long_interest",
  "margin_short_interest",
  "margin_current_individual_ratio",
  "margin_current_company_ratio",
  "margin_next_individual_ratio",
  "margin_next_company_ratio",
] as const;

/** リスク想定比率の適用終了日時（Unix ms の number | null）。 */
export const MARGIN_UNTIL_KEYS = [
  "margin_current_individual_until",
  "margin_current_company_until",
  "margin_next_individual_until",
  "margin_next_company_until",
] as const;

/** ロング / ショートの新規建て注文停止ステータス（boolean）。 */
export const MARGIN_STOP_KEYS = ["stop_margin_long_order", "stop_margin_short_order"] as const;

function shape<K extends string, T extends z.ZodTypeAny>(
  keys: readonly K[],
  type: T,
): { [P in K]: T } {
  return Object.fromEntries(keys.map((k) => [k, type])) as { [P in K]: T };
}

/** API 生レスポンス用。率は文字列 | null を number | null に変換する。 */
export const marginPairFieldsApi = {
  ...shape(MARGIN_RATE_KEYS, nullableNumStr.optional()),
  ...shape(MARGIN_UNTIL_KEYS, z.number().nullable().optional()),
  ...shape(MARGIN_STOP_KEYS, z.boolean().optional()),
};

/** pairs キャッシュ用。API 経由で parse 済みの number | null をそのまま保存する。 */
export const marginPairFieldsCached = {
  ...shape(MARGIN_RATE_KEYS, z.number().nullable().optional()),
  ...shape(MARGIN_UNTIL_KEYS, z.number().nullable().optional()),
  ...shape(MARGIN_STOP_KEYS, z.boolean().optional()),
};

/** schema カタログ（JSON Schema の properties）用。信用非対応ペアでは率・日時が null。 */
export const marginPairJsonProps: Record<string, { type: string | string[] }> = Object.fromEntries([
  ...[...MARGIN_RATE_KEYS, ...MARGIN_UNTIL_KEYS].map((k) => [k, { type: ["number", "null"] }]),
  ...MARGIN_STOP_KEYS.map((k) => [k, { type: "boolean" }]),
]);
