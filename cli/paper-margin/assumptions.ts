// paper の信用で、public の API から取れない値の既定（ADR-010 決定 3）。ここが単一ソース。
// - 公表ルール由来の定数（強制決済掛け目・追証の基準時と期限）。bitbank の信用取引ルールにあるが API では取れない
// - 仮定（評価時の価格 = ticker の last、差入保証金 = JPY だけ）。公表資料に無いか、v1 で再現しないもの
// どちらも paper init（または v3 からの移行）のときに state へ固定し、出力の assumptions に出す。
// CLI のバージョンが上がって既定が変わっても、既存の仮想口座の結果がこっそり変わらないようにするため。
import { z } from "zod";

export const MarginRulesSchema = z.object({
  /** 強制決済掛け目: 維持必要保証金額 × これ > 受入保証金合計額 で強制決済 */
  losscutMultiplier: z.number().positive().max(1),
  /** 追証の基準時（毎日 JST の何時か） */
  marginCallHourJst: z.number().int().min(0).max(23),
  /** 追証の解消期限（基準時からのミリ秒） */
  marginCallGraceMs: z.number().int().positive(),
});

export const MarginAssumptionsSchema = z.object({
  rules: MarginRulesSchema,
  /** 評価時の価格（公表資料に定義が無い。計画書 #PM-4 の仮定） */
  valuationPrice: z.literal("last"),
  /** 差入保証金の範囲（代用暗号資産を入れない。保証金を少なく見積もる安全側） */
  collateral: z.literal("jpy-only"),
  /** 公表ルールの出典と確認日 */
  source: z.string(),
  /** state に固定した時刻（ISO 8601）。init の時刻か、v3 から移行した state の updatedAt */
  fixedAt: z.string(),
});

export type MarginRules = z.infer<typeof MarginRulesSchema>;
export type MarginAssumptions = z.infer<typeof MarginAssumptionsSchema>;

export const DEFAULT_MARGIN_RULES: MarginRules = {
  losscutMultiplier: 0.5,
  marginCallHourJst: 15,
  marginCallGraceMs: 24 * 60 * 60 * 1000,
};

export const DEFAULT_LOSSCUT_MULTIPLIER = DEFAULT_MARGIN_RULES.losscutMultiplier;

export const MARGIN_RULES_SOURCE =
  "bitbank 信用取引ルール https://bitbank.cc/guide/margin-trading-rule（2026-11-24 確認）";

export function defaultMarginAssumptions(fixedAt: string): MarginAssumptions {
  return {
    rules: { ...DEFAULT_MARGIN_RULES },
    valuationPrice: "last",
    collateral: "jpy-only",
    source: MARGIN_RULES_SOURCE,
    fixedAt,
  };
}
