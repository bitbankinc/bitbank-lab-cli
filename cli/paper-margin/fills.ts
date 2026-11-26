// paper の信用の指値の約定（ADR-010 / docs/dev/paper-margin-plan.md §4 Step 5）。純関数。
// 現物の指値（cli/paper-fill.ts）と同じく、足の安値・高値が指値に触れたら指値ぴったりで約定させる。
// 指値は板に置く側なので maker。手数料率は新規建てなら margin_open_maker、返済なら margin_close_maker。
// 新規建ての手数料は建玉に積み（positions.ts）、返済は損益を確定して JPY 残高に足す（close.ts）。
// 約定の前に、その時刻までの利息を積んでおくこと。
import { type MarginIntent, marginOperation } from "../margin-operation.js";
import { snapAmount } from "../paper-precision.js";
import type { Result } from "../types.js";
import { applyClose, type CloseSettlement } from "./close.js";
import type { PriceRange } from "./losscut.js";
import type { MarginPairParams } from "./params.js";
import { applyOpen } from "./positions.js";
import type { MarginBook, MarginOrder } from "./state.js";

export type MarginFillEvent = {
  order: MarginOrder;
  intent: MarginIntent;
  at: string;
  fee: number;
  /** 返済のときだけ */
  settlement?: CloseSettlement;
};

/** 足が指値に触れたか（買いは安値が指値以下、売りは高値が指値以上） */
export function orderHits(o: MarginOrder, range: PriceRange): boolean {
  return o.side === "buy" ? range.low <= o.price : range.high >= o.price;
}

/** 信用の指値を約定させ、注文を book から外す */
export function applyOrderFill(
  book: MarginBook,
  o: MarginOrder,
  fee: Pick<MarginPairParams, "fee">["fee"],
  at: string,
): Result<{ book: MarginBook; event: MarginFillEvent }> {
  const intent = marginOperation(o.side, o.positionSide).intent;
  const rate = intent === "open" ? fee.openMaker : fee.closeMaker;
  const amountFee = snapAmount(o.amount * o.price * rate);
  const fill = {
    pair: o.pair,
    positionSide: o.positionSide,
    amount: o.amount,
    price: o.price,
    fee: amountFee,
    at,
  };
  const orders = book.orders.filter((x) => x.id !== o.id);
  if (intent === "open") {
    const r = applyOpen(book.positions, fill);
    if (!r.success) return r;
    return {
      success: true,
      data: {
        book: { ...book, positions: r.data, orders },
        event: { order: o, intent, at, fee: amountFee },
      },
    };
  }
  const r = applyClose(book.positions, fill);
  if (!r.success) return r;
  const { positions, settlement } = r.data;
  const jpy = snapAmount(book.jpy + settlement.profitLoss);
  return {
    success: true,
    data: {
      book: { ...book, jpy, positions, orders },
      event: { order: o, intent, at, fee: amountFee, settlement },
    },
  };
}
