// paper の信用の返済と精算（ADR-010 / docs/dev/paper-margin-plan.md §3.3）。純関数。
//
// - 未実現の手数料・利息は返済数量で按分して精算する。手数料は「按分した新規建て分 + この返済分」で、
//   本番の信用決済の手数料が「建て分 + 決済分の合算」で請求されるのに合わせる
// - 返済の損益は手数料・利息を引いた後のネット値。本番 trade-history の profit_loss と同じ定義で、
//   JPY 残高にはこの値だけを足す
// どちらも実口座で検算一致まで確認済み（docs/dev/tax-evidence/ANSWERS.md §4、
// docs/dev/tax-roadmap.md の信用の実機検証）。部分返済での手数料の按分は bitbank の信用取引ルールに明記されている
// （docs/dev/paper-margin-plan.md §2.3）。積み上がった利息の按分はルールに無く、平均法からの推定
import { BALANCE_EPS, hasEnough, snapAmount } from "../paper-precision.js";
import type { Result } from "../types.js";
import {
  averagePrice,
  findPosition,
  interestNotAccrued,
  invalidFill,
  type MarginFill,
  replacePosition,
} from "./positions.js";
import type { MarginPosition } from "./state.js";

export type CloseSettlement = {
  /** 返済に使った平均建値 */
  averagePrice: number;
  /** 手数料・利息を引く前の差損益 */
  gross: number;
  /** 按分した新規建て手数料 + この返済の手数料 */
  feeCharged: number;
  /** 按分した利息 */
  interestCharged: number;
  /** gross − feeCharged − interestCharged。JPY 残高に足す値 */
  profitLoss: number;
};

/** 返済の約定を建玉から引き、損益を確定する。返済数量が建玉を EPS 以内で上回る場合は
 *  全量返済とみなす（浮動小数の累積誤差で全量返済が通らなくなるのを防ぐ。issue #30 と同じ）。
 *  返済可能数量（建玉 − locked）の検査は発注時に closable.ts で済ませておく。
 *  約定時刻までの利息は accrueInterest で積んでおくこと（積み残しがあれば拒否する）。 */
export function applyClose(
  positions: readonly MarginPosition[],
  f: MarginFill,
): Result<{ positions: MarginPosition[]; settlement: CloseSettlement }> {
  const bad = invalidFill(f);
  if (bad) return { success: false, error: `margin close: ${bad}` };
  const cur = findPosition(positions, f.pair, f.positionSide);
  if (!cur) {
    return { success: false, error: `margin close: no ${f.positionSide} position for ${f.pair}` };
  }
  const pending = interestNotAccrued(cur, f);
  if (pending) return { success: false, error: `margin close: ${pending}` };
  if (!hasEnough(cur.openAmount, f.amount)) {
    return {
      success: false,
      error: `margin close: amount ${f.amount} exceeds open amount ${cur.openAmount} (${f.pair} ${f.positionSide})`,
    };
  }
  const remaining = cur.openAmount - f.amount;
  const full = remaining < BALANCE_EPS;
  const closed = full ? cur.openAmount : f.amount;
  const ratio = full ? 1 : f.amount / cur.openAmount;
  const avg = averagePrice(cur);
  const gross = (f.positionSide === "long" ? f.price - avg : avg - f.price) * closed;
  const feeCharged = cur.unrealizedFee * ratio + f.fee;
  const interestCharged = cur.unrealizedInterest * ratio;
  const settlement: CloseSettlement = {
    averagePrice: avg,
    gross: snapAmount(gross),
    feeCharged: snapAmount(feeCharged),
    interestCharged: snapAmount(interestCharged),
    profitLoss: snapAmount(gross - feeCharged - interestCharged),
  };
  if (full) {
    return { success: true, data: { positions: positions.filter((p) => p !== cur), settlement } };
  }
  const reduced: MarginPosition = {
    ...cur,
    openAmount: snapAmount(remaining),
    product: snapAmount(cur.product * (1 - ratio)),
    unrealizedFee: snapAmount(cur.unrealizedFee * (1 - ratio)),
    unrealizedInterest: snapAmount(cur.unrealizedInterest * (1 - ratio)),
  };
  return {
    success: true,
    data: { positions: replacePosition(positions, cur, reduced), settlement },
  };
}
