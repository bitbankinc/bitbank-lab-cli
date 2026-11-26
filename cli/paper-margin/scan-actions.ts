// scan-step.ts の 1 時刻ぶんの処理で使う行為（ADR-010 決定 4 / docs/dev/paper-margin-plan.md §3.5・§3.6）。純関数。
// - losscut: 全建玉を足の不利な極値で決済し、信用の注文を取り消す
// - fillOrders: その時刻の足が指値に触れた注文を約定させる。返済で追証が解ければ解消する
// - resolveBySpotSale: その時刻に JPY 建ての現物の売りが約定していれば、売った直後の口座で追証の解消を判定する
//   （差入方法の「現物の売却」。追証の基準時より前の売りは数えない＝価格の回復だけで解消させない）
import { marginOperation } from "../margin-operation.js";
import type { Result } from "../types.js";
import { applyOrderFill, orderHits } from "./fills.js";
import { executeLosscut, worstPrices } from "./losscut.js";
import { resolvesMarginCall } from "./margin-call.js";
import { accountAt, rangesAt, type ScanContext } from "./scan-context.js";
import type { MarginBook } from "./state.js";

export function losscut(
  ctx: ScanContext,
  book: MarginBook,
  t: number,
  reason: "below-losscut" | "margin-call-expired",
): Result<MarginBook> {
  const at = new Date(t).toISOString();
  const prices = worstPrices(book.positions, rangesAt(ctx, book, t));
  if (!prices.success) return prices;
  const closeTaker = (pair: string) => ctx.input.params.get(pair)?.fee.closeTaker;
  const r = executeLosscut(book, prices.data, closeTaker, at);
  if (!r.success) return r;
  ctx.events.push({
    kind: "losscut",
    at,
    reason,
    closes: r.data.closes,
    canceled: r.data.canceled,
  });
  return { success: true, data: r.data.book };
}

/** その時刻に足のあるペアで、指値に触れた intent の注文を約定させる。返済で追証が解ければ解消する */
export function fillOrders(
  ctx: ScanContext,
  start: MarginBook,
  t: number,
  intent: "open" | "close",
): Result<MarginBook> {
  let book = start;
  const at = new Date(t).toISOString();
  for (const o of start.orders) {
    if (marginOperation(o.side, o.positionSide).intent !== intent) continue;
    const candle = ctx.track.candleAt(o.pair, t);
    if (Date.parse(o.createdAt) > t || !candle || !orderHits(o, candle)) continue;
    const params = ctx.input.params.get(o.pair);
    if (!params) return { success: false, error: `margin scan: no margin params for ${o.pair}` };
    const r = applyOrderFill(book, o, params.fee, at);
    if (!r.success) return r;
    book = r.data.book;
    ctx.events.push({ kind: "fill", ...r.data.event });
    if (intent === "close" && book.call) {
      const resolved = resolveIfCleared(ctx, book, t);
      if (!resolved.success) return resolved;
      book = resolved.data;
    }
  }
  return { success: true, data: book };
}

/** その時刻に JPY 建ての現物の指値の売りが約定していて、追証の基準時以降なら、解消を判定する */
export function resolveBySpotSale(
  ctx: ScanContext,
  book: MarginBook,
  t: number,
): Result<MarginBook> {
  const sold = (ctx.input.spotSaleTimes ?? []).includes(t);
  if (!book.call || !sold || t < Date.parse(book.call.judgedAt)) {
    return { success: true, data: book };
  }
  return resolveIfCleared(ctx, book, t);
}

/** 解消の行為の直後の口座（足の不利な極値で評価）で追証が解けていれば消す */
function resolveIfCleared(ctx: ScanContext, book: MarginBook, t: number): Result<MarginBook> {
  const acc = accountAt(ctx, book, t);
  if (!acc.success) return acc;
  if (!resolvesMarginCall(acc.data)) return { success: true, data: book };
  ctx.events.push({ kind: "margin-call-resolved", at: new Date(t).toISOString() });
  return { success: true, data: { ...book, call: null } };
}
