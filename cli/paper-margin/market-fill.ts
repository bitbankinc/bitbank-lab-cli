// paper の信用の成行注文の約定（ADR-010 / docs/dev/paper-margin-plan.md §4 Step 5）。純関数。
// 現物 paper の成行と同じく、ticker の last で即時に約定させる（スリッページなし）。手数料は taker 率で、
// 円に丸めない（本番の約定履歴も円未満まで計上する。計画書 §2.4）。
// 約定の前に、その時刻までの利息を積む（既存の建玉への追加・返済は積み残しがあると拒否されるため）。
// 返済で追証が残っていれば、約定後の口座を現在値で評価し、解けていれば解消する（返済は解消の行為）。
import type { MarginOperation, OrderSide, PositionSide } from "../margin-operation.js";
import { snapAmount } from "../paper-precision.js";
import type { PaperState } from "../paper-state.js";
import type { Result } from "../types.js";
import { bookOf, withBook } from "./book.js";
import { applyClose } from "./close.js";
import type { MarginHistoryEntry } from "./history.js";
import { accrueInterest } from "./interest.js";
import { resolvesAfterAction } from "./margin-call.js";
import type { MarginPairParams } from "./params.js";
import { applyOpen } from "./positions.js";

export type MarketFillInput = {
  id: string;
  pair: string;
  side: OrderSide;
  positionSide: PositionSide;
  amount: number;
  op: MarginOperation;
  /** 建玉のある全ペアと注文のペアの現在値（ticker の last） */
  prices: ReadonlyMap<string, number>;
  params: ReadonlyMap<string, MarginPairParams>;
  nowMs: number;
};

export function fillMarginMarket(
  state: PaperState,
  input: MarketFillInput,
): Result<{ state: PaperState; fill: MarginHistoryEntry; marginCallResolved: boolean }> {
  const price = input.prices.get(input.pair);
  const params = input.params.get(input.pair);
  if (price === undefined || !params)
    return { success: false, error: `margin market: no price or params for ${input.pair}` };
  const start = bookOf(state);
  const accrued = accrueInterest(start.positions, input.params, input.nowMs);
  if (!accrued.success) return accrued;
  const at = new Date(input.nowMs).toISOString();
  const open = input.op.intent === "open";
  const fee = snapAmount(
    input.amount * price * (open ? params.fee.openTaker : params.fee.closeTaker),
  );
  const fill = {
    pair: input.pair,
    positionSide: input.positionSide,
    amount: input.amount,
    price,
    fee,
    at,
  };
  const base = {
    id: input.id,
    pair: input.pair,
    side: input.side,
    positionSide: input.positionSide,
    type: "market" as const,
    amount: input.amount,
    fillPrice: price,
    feeOccurred: fee,
    filledAt: at,
  };
  let book = { ...start, positions: accrued.data.positions };
  let entry: MarginHistoryEntry;
  if (open) {
    const r = applyOpen(book.positions, fill);
    if (!r.success) return r;
    book = { ...book, positions: r.data };
    entry = { ...base, feeCharged: 0, profitLoss: 0, interest: 0 };
  } else {
    const r = applyClose(book.positions, fill);
    if (!r.success) return r;
    const s = r.data.settlement;
    book = { ...book, positions: r.data.positions, jpy: snapAmount(book.jpy + s.profitLoss) };
    entry = {
      ...base,
      feeCharged: s.feeCharged,
      profitLoss: s.profitLoss,
      interest: s.interestCharged,
    };
  }
  const ranges = new Map(
    [...input.prices].map(([pair, px]) => [pair, { low: px, high: px }] as const),
  );
  const marginCallResolved =
    !open && book.call !== null && resolvesAfterAction(book, ranges, input.params);
  if (marginCallResolved) book = { ...book, call: null };
  const next = withBook(state, book);
  const margin = { ...next.margin, history: [...next.margin.history, entry] };
  return { success: true, data: { state: { ...next, margin }, fill: entry, marginCallResolved } };
}
