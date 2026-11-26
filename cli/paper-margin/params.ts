// 100行超: 返り値の型（後続の account / positions が使う）と、欠落 → 非対応 → 範囲 → 適用期間の
// 順の検証を 1 か所に置く。検証を分けると fail-closed の判定順が複数ファイルに散るため。
//
// pairs の信用フィールド → paper の信用で使うペアごとのパラメータ（ADR-010 決定 3）。
// public の /spot/pairs から取れる値だけで組み立てる純関数。取得（pairs キャッシュ）は呼び出し側。
//
// 判定は fail-closed に倒す。欠落・想定外の値は「不明」として返し、黙って既定値で埋めない
// （古いキャッシュや API 形状の変化で、非対応ペアを対応と取り違えないため）。
// 法人のリスク想定比率は使わない（個人口座が前提。docs/dev/paper-margin-plan.md §1）。
import { z } from "zod";
import type { CachedPair } from "../pairs-cache.js";

// state（margin.lastParams）にも控えとして保存するので Zod で持つ
export const MarginPairParamsSchema = z.object({
  pair: z.string(),
  /** 個人のリスク想定比率。維持必要保証金 = 建玉数量 × 平均建値 × riskRatio */
  riskRatio: z.number(),
  /** riskRatio の適用終了日時（Unix ms、この時刻を含む） */
  riskRatioUntilMs: z.number(),
  /** current を使ったか、current の適用終了後なので next に切り替えたか。
   *  last-known は pairs から読めず、最後に読めた控え（state の margin.lastParams）を使った */
  riskRatioSource: z.enum(["current", "next", "last-known"]),
  fee: z.object({
    openMaker: z.number(),
    openTaker: z.number(),
    closeMaker: z.number(),
    closeTaker: z.number(),
  }),
  /** 利息率 /日（小数。0.0004 = 0.04%） */
  interestPerDay: z.object({ long: z.number(), short: z.number() }),
  stopNewLong: z.boolean(),
  stopNewShort: z.boolean(),
});

export type MarginPairParams = z.infer<typeof MarginPairParamsSchema>;

export type MarginParamsLookup =
  | { kind: "ok"; params: MarginPairParams }
  /** 信用非対応（リスク想定比率が null） */
  | { kind: "unsupported"; pair: string }
  /** 欠落・想定外の値。古いキャッシュか API 形状の変化 */
  | { kind: "unknown"; pair: string; reason: string }
  /** current も next も適用終了を過ぎた。pairs を取り直す */
  | { kind: "stale"; pair: string };

const REQUIRED = [
  "margin_open_maker_fee_rate_quote",
  "margin_open_taker_fee_rate_quote",
  "margin_close_maker_fee_rate_quote",
  "margin_close_taker_fee_rate_quote",
  "margin_long_interest",
  "margin_short_interest",
  "margin_current_individual_until",
  "stop_margin_long_order",
  "stop_margin_short_order",
] as const;

const isRatio = (x: number) => x > 0 && x <= 1;
const isFeeRate = (x: number) => Math.abs(x) < 1;
const isInterest = (x: number) => x >= 0 && x < 1;

export function marginParamsOf(p: CachedPair, nowMs: number): MarginParamsLookup {
  const ratio = p.margin_current_individual_ratio;
  if (ratio === undefined) {
    return { kind: "unknown", pair: p.name, reason: "pairs に信用フィールドが無い" };
  }
  if (ratio === null) return { kind: "unsupported", pair: p.name };
  const missing = REQUIRED.filter((k) => p[k] === undefined || p[k] === null);
  if (missing.length > 0) {
    return {
      kind: "unknown",
      pair: p.name,
      reason: `信用フィールドが欠けている: ${missing.join(", ")}`,
    };
  }
  // REQUIRED の検査で null / undefined は除外済み
  const fee = {
    openMaker: p.margin_open_maker_fee_rate_quote as number,
    openTaker: p.margin_open_taker_fee_rate_quote as number,
    closeMaker: p.margin_close_maker_fee_rate_quote as number,
    closeTaker: p.margin_close_taker_fee_rate_quote as number,
  };
  const interestPerDay = {
    long: p.margin_long_interest as number,
    short: p.margin_short_interest as number,
  };
  const next = p.margin_next_individual_ratio;
  const nextUntil = p.margin_next_individual_until;
  const bad = [
    !isRatio(ratio) && `margin_current_individual_ratio=${ratio}`,
    typeof next === "number" && !isRatio(next) && `margin_next_individual_ratio=${next}`,
    !Object.values(fee).every(isFeeRate) && "fee rate out of range",
    !Object.values(interestPerDay).every(isInterest) && "interest rate out of range",
  ].filter(Boolean);
  if (bad.length > 0) {
    return { kind: "unknown", pair: p.name, reason: `想定外の値: ${bad.join(", ")}` };
  }
  const currentUntil = p.margin_current_individual_until as number;
  let chosen: Pick<MarginPairParams, "riskRatio" | "riskRatioUntilMs" | "riskRatioSource">;
  if (nowMs <= currentUntil) {
    chosen = { riskRatio: ratio, riskRatioUntilMs: currentUntil, riskRatioSource: "current" };
  } else if (typeof next === "number" && typeof nextUntil === "number" && nowMs <= nextUntil) {
    chosen = { riskRatio: next, riskRatioUntilMs: nextUntil, riskRatioSource: "next" };
  } else {
    return { kind: "stale", pair: p.name };
  }
  return {
    kind: "ok",
    params: {
      pair: p.name,
      ...chosen,
      fee,
      interestPerDay,
      stopNewLong: p.stop_margin_long_order as boolean,
      stopNewShort: p.stop_margin_short_order as boolean,
    },
  };
}
