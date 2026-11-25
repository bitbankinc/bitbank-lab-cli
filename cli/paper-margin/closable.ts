// 返済可能数量（ADR-010 / docs/dev/paper-margin-plan.md §3.3・§4 Step 5）。
// 本番では locked_amount（未約定の返済注文が予約している数量）を建玉から引いた残りまでしか
// 返済注文を出せず、超えると API が 50062 で拒否する（建玉が無いときも 50062。実機確認 #M-6）。
// paper は locked_amount を state に持たず、未約定注文から導く（state.ts 冒頭）。
import { marginOperation, type OrderSide, type PositionSide } from "../margin-operation.js";
import { hasEnough, snapAmount } from "../paper-precision.js";
import type { Result } from "../types.js";
import { findPosition } from "./positions.js";
import type { MarginPosition } from "./state.js";

/** 未約定注文のうち返済可能数量の計算に要る部分。現物の注文は positionSide を持たない */
export type MarginOrderLike = {
  pair: string;
  side: OrderSide;
  positionSide?: PositionSide;
  amount: number;
};

/** 本番 margin-positions の locked_amount（アクティブな返済注文の remaining_amount の合計）。
 *  paper の指値は部分約定しないので remaining_amount = amount。 */
export function lockedAmountOf(
  orders: readonly MarginOrderLike[],
  pair: string,
  positionSide: PositionSide,
): number {
  let sum = 0;
  for (const o of orders) {
    if (o.pair !== pair || o.positionSide !== positionSide) continue;
    if (marginOperation(o.side, positionSide).intent === "close") sum += o.amount;
  }
  return snapAmount(sum);
}

/** 返済注文を出してよいか。返済可能数量 = 建玉数量 − locked_amount。
 *  比較は EPS を許容する（返済可能数量をそのまま渡した全量返済が丸め誤差で弾かれないように）。 */
export function checkClosable(
  positions: readonly MarginPosition[],
  orders: readonly MarginOrderLike[],
  req: { pair: string; positionSide: PositionSide; amount: number },
): Result<{ closable: number }> {
  const label = `${req.pair} の${req.positionSide === "long" ? "ロング" : "ショート"}`;
  const cur = findPosition(positions, req.pair, req.positionSide);
  if (!cur) {
    return { success: false, error: `${label}建玉がありません（本番では 50062 で拒否される）` };
  }
  const locked = lockedAmountOf(orders, req.pair, req.positionSide);
  const closable = snapAmount(cur.openAmount - locked);
  if (hasEnough(closable, req.amount)) return { success: true, data: { closable } };
  return {
    success: false,
    error:
      `返済可能数量を超えています（本番では 50062 で拒否される）: ${label}返済可能数量は ${closable}` +
      `（建玉 ${cur.openAmount} − 未約定の返済注文 ${locked}）、指定は ${req.amount}`,
  };
}
