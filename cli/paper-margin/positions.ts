// paper の信用の建玉（ADR-010 / docs/dev/paper-margin-plan.md §3.3）。
// 新規建ての積み上げと評価を持つ純関数群。返済の精算は close.ts、返済可能数量は closable.ts。
// state の読み書き・手数料の丸め・利息の積み上げは呼び出し側が行う。
//
// - 建玉は pair × position_side で 1 本に集約し、平均建値で持つ（本番 margin-positions と同じ粒度）。
//   同じペアのロングとショートは別の建玉として並ぶ（両建て）
// - 新規建ての手数料は JPY から引かず、未実現手数料として建玉に積む（精算は返済時。close.ts）
import type { PositionSide } from "../margin-operation.js";
import { snapAmount } from "../paper-precision.js";
import type { Result } from "../types.js";
import { pendingInterestBoundaries } from "./interest.js";
import type { MarginPosition } from "./state.js";

export type MarginFill = {
  pair: string;
  positionSide: PositionSide;
  amount: number;
  price: number;
  /** この約定の手数料（quote 建て。リベートなら負）。丸めは呼び出し側が決める */
  fee: number;
  /** 約定時刻（ISO 8601） */
  at: string;
};

export function averagePrice(p: MarginPosition): number {
  return p.product / p.openAmount;
}

/** 評価損益（手数料・利息は含まない）。price は評価価格 */
export function unrealizedPnl(p: MarginPosition, price: number): number {
  const avg = averagePrice(p);
  return (p.positionSide === "long" ? price - avg : avg - price) * p.openAmount;
}

export function findPosition(
  positions: readonly MarginPosition[],
  pair: string,
  positionSide: PositionSide,
): MarginPosition | undefined {
  return positions.find((p) => p.pair === pair && p.positionSide === positionSide);
}

/** 約定の数値が使える形か。使えなければ理由を返す */
export function invalidFill(f: MarginFill): string | null {
  if (!(Number.isFinite(f.amount) && f.amount > 0)) return `invalid amount: ${f.amount}`;
  if (!(Number.isFinite(f.price) && f.price > 0)) return `invalid price: ${f.price}`;
  if (!Number.isFinite(f.fee)) return `invalid fee: ${f.fee}`;
  return null;
}

/** 利息を積み残したまま建玉を変えようとしていれば理由を返す（interest.ts 冒頭） */
export function interestNotAccrued(p: MarginPosition, f: MarginFill): string | null {
  const n = pendingInterestBoundaries(p, Date.parse(f.at)).length;
  if (n === 0) return null;
  return `interest not accrued up to ${f.at} (${n} JST midnight(s) pending for ${p.pair} ${p.positionSide})`;
}

/** 建玉の配列で prev を next に差し替える（順序は保つ） */
export function replacePosition(
  positions: readonly MarginPosition[],
  prev: MarginPosition,
  next: MarginPosition,
): MarginPosition[] {
  return positions.map((p) => (p === prev ? next : p));
}

/** 新規建ての約定を建玉に足す。既存の建玉があれば数量・quote 量・未実現手数料を加算して
 *  平均建値を更新する（openedAt / lastInterestAt は既存のまま）。既存の建玉に足すときは、
 *  約定時刻までの利息を accrueInterest で積んでおくこと（積み残しがあれば拒否する）。 */
export function applyOpen(
  positions: readonly MarginPosition[],
  f: MarginFill,
): Result<MarginPosition[]> {
  const bad = invalidFill(f);
  if (bad) return { success: false, error: `margin open: ${bad}` };
  const notional = f.amount * f.price;
  const cur = findPosition(positions, f.pair, f.positionSide);
  if (!cur) {
    const created: MarginPosition = {
      pair: f.pair,
      positionSide: f.positionSide,
      openAmount: snapAmount(f.amount),
      product: snapAmount(notional),
      unrealizedFee: snapAmount(f.fee),
      unrealizedInterest: 0,
      openedAt: f.at,
      lastInterestAt: f.at,
    };
    return { success: true, data: [...positions, created] };
  }
  const pending = interestNotAccrued(cur, f);
  if (pending) return { success: false, error: `margin open: ${pending}` };
  const merged: MarginPosition = {
    ...cur,
    openAmount: snapAmount(cur.openAmount + f.amount),
    product: snapAmount(cur.product + notional),
    unrealizedFee: snapAmount(cur.unrealizedFee + f.fee),
  };
  return { success: true, data: replacePosition(positions, cur, merged) };
}
