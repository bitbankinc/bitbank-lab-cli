// 維持必要保証金・約定時必要保証金のロング / ショート別の内訳（本番 margin-status の
// total_long_* / total_short_* の欄。ADR-010 / docs/dev/paper-margin-plan.md §3.7）。純関数。
// 合計は account.ts の evaluateAccount と同じ定義で、ここは建玉・新規建て注文の position_side で分けるだけ。
import { marginOperation } from "../margin-operation.js";
import type { MarginBook } from "./state.js";

type Sides = { long: number; short: number };

export function maintenanceBySide(
  book: MarginBook,
  riskRatio: (pair: string) => number | undefined,
): { position: Sides; order: Sides } {
  const position: Sides = { long: 0, short: 0 };
  const order: Sides = { long: 0, short: 0 };
  for (const p of book.positions) position[p.positionSide] += p.product * (riskRatio(p.pair) ?? 0);
  for (const o of book.orders) {
    if (marginOperation(o.side, o.positionSide).intent !== "open") continue;
    order[o.positionSide] += o.amount * o.price * (riskRatio(o.pair) ?? 0);
  }
  return { position, order };
}
