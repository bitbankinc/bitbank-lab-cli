// paper の信用の利息（ADR-010 決定 7 / docs/dev/paper-margin-plan.md §2.3・§2.4）。純関数。
//
// 買建ての利息・売建ての暗号資産貸付料は、JST 0 時をまたぐたびに、その時点の建玉の product × 日率 を積む。
// 建てた直後は 0、0 時をまたぐと 1 日分、24h 経っても 0 時をまたがなければ増えない
// （このリポの税務調査の実測。`interest = product × 0.0004 × またいだ 0 時の回数` が原精度で成立）。
// 精度は原精度のまま積む（本番の約定履歴の interest と同じ）。精算は返済時（close.ts）。
//
// - 日率は /spot/pairs のライブ値（margin_long_interest / margin_short_interest）。間をあけて tick したとき、
//   過去の 0 時にも現在の日率を使う（paper は過去の日率を持たない。実際の値は 0.0004 で据え置かれている）
// - 呼び出し側は、約定を建玉に適用する前に、その時刻まで accrueInterest で積んでおく。
//   積み残しのまま建玉を変えると、追加分に過去の利息が掛かったり、返済で利息が漏れたりするため、
//   positions.ts / close.ts は積み残しがあると拒否する（pendingInterestBoundaries）
import { jstDailyInstants } from "../date-utils.js";
import type { PositionSide } from "../margin-operation.js";
import { snapAmount } from "../paper-precision.js";
import type { Result } from "../types.js";
import type { MarginPairParams } from "./params.js";
import type { MarginPosition } from "./state.js";

/** 利息を積む JST の時刻（0 時） */
export const INTEREST_BOUNDARY_HOUR_JST = 0;

export type InterestCharge = {
  pair: string;
  positionSide: PositionSide;
  /** 利息を積んだ JST 0 時（Unix ms） */
  atMs: number;
  amount: number;
};

/** 建玉にまだ積んでいない利息の境界（(lastInterestAt, atMs] にある JST 0 時） */
export function pendingInterestBoundaries(p: MarginPosition, atMs: number): number[] {
  return jstDailyInstants(Date.parse(p.lastInterestAt), atMs, INTEREST_BOUNDARY_HOUR_JST);
}

/** 全建玉に toMs までの利息を積み、lastInterestAt を toMs に進める。
 *  0 時をまたぐ建玉のペアに日率が無ければ失敗する（利息を黙って 0 にすると費用を過小に見せるため）。
 *  0 時をまたがない建玉には日率を求めない。 */
export function accrueInterest(
  positions: readonly MarginPosition[],
  ratesByPair: ReadonlyMap<string, Pick<MarginPairParams, "interestPerDay">>,
  toMs: number,
): Result<{ positions: MarginPosition[]; charges: InterestCharge[] }> {
  if (!Number.isFinite(toMs)) {
    return { success: false, error: `accrue interest: invalid time ${toMs}` };
  }
  const toIso = new Date(toMs).toISOString();
  const charges: InterestCharge[] = [];
  const missing = new Set<string>();
  const next = positions.map((p) => {
    if (!(toMs > Date.parse(p.lastInterestAt))) return p;
    const boundaries = pendingInterestBoundaries(p, toMs);
    if (boundaries.length === 0) return { ...p, lastInterestAt: toIso };
    const rate = ratesByPair.get(p.pair)?.interestPerDay[p.positionSide];
    if (rate === undefined) {
      missing.add(p.pair);
      return p;
    }
    const perDay = p.product * rate;
    for (const atMs of boundaries) {
      charges.push({
        pair: p.pair,
        positionSide: p.positionSide,
        atMs,
        amount: snapAmount(perDay),
      });
    }
    return {
      ...p,
      unrealizedInterest: snapAmount(p.unrealizedInterest + perDay * boundaries.length),
      lastInterestAt: toIso,
    };
  });
  if (missing.size > 0) {
    return {
      success: false,
      error: `accrue interest: no interest rate for ${[...missing].join(", ")} (check margin fields in pairs)`,
    };
  }
  return { success: true, data: { positions: next, charges } };
}
