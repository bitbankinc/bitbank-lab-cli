// scan.ts の 1 時刻ぶんの処理（ADR-010 決定 4・7 / docs/dev/paper-margin-plan.md §3.5・§3.6）。
//   1. その時刻までの利息を積む → 2. 新規建ての指値の約定 → 3. JST 15 時なら追証を判定 →
//   4. 追証の期限切れか強制決済の判定基準で強制決済 → 5. 返済の指値の約定（約定後に追証が解ければ解消）→
//   6. その時刻に JPY 建ての現物の売りが約定していれば、追証の解消を判定
// 同じ足の中での前後は分からないので、強制決済が早く起きる順にしている（新規建てで建玉が増えてから判定し、
// 返済で建玉が減るのや、現物の売りで JPY が増えるのを数えるのは判定の後）。行為の本体は scan-actions.ts。
import type { Result } from "../types.js";
import { isLosscutCondition } from "./conditions.js";
import { accrueInterest } from "./interest.js";
import { isMarginCallExpired, judgeMarginCall } from "./margin-call.js";
import { fillOrders, losscut, resolveBySpotSale } from "./scan-actions.js";
import { accountAt, type ScanContext } from "./scan-context.js";
import type { MarginBook } from "./state.js";

export function step(
  ctx: ScanContext,
  start: MarginBook,
  t: number,
  isCallTime: boolean,
): Result<MarginBook> {
  const accrued = accrueInterest(start.positions, ctx.input.params, t);
  if (!accrued.success) return accrued;
  ctx.interest.push(...accrued.data.charges);
  const opened = fillOrders(ctx, { ...start, positions: accrued.data.positions }, t, "open");
  if (!opened.success) return opened;
  let book = opened.data;
  if (book.positions.length === 0) return { success: true, data: book };
  if (isCallTime && !book.call) {
    const acc = accountAt(ctx, book, t);
    if (!acc.success) return acc;
    const call = judgeMarginCall(acc.data, t, ctx.input.rules);
    if (call) {
      book = { ...book, call };
      ctx.events.push({ kind: "margin-call", call });
    }
  }
  const expired = book.call !== null && isMarginCallExpired(book.call, t);
  const acc = accountAt(ctx, book, t);
  if (!acc.success) return acc;
  if (expired || isLosscutCondition(acc.data, ctx.input.rules.losscutMultiplier)) {
    return losscut(ctx, book, t, expired ? "margin-call-expired" : "below-losscut");
  }
  const closed = fillOrders(ctx, book, t, "close");
  if (!closed.success) return closed;
  return resolveBySpotSale(ctx, closed.data, t);
}
