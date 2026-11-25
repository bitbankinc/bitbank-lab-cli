// paper margin-positions の出力（ADR-010 / docs/dev/paper-margin-plan.md §3.7）。純関数。
// 本番 margin-positions と同じ名前の欄（notice / payables / positions[].open_amount ほか）を出す。
// - locked_amount は未約定の返済注文から導く（closable.ts）。average_price = product / open_amount
// - current_price / unrealized_profit_loss は paper だけの欄（本番の API は建玉ごとの評価損益を返さない）。
//   評価価格は ticker の last（仮定。assumptions.valuationPrice）
// - notice は追証なら what: "margin_call"（期限つき）、不足金なら what: "debt"。日時は本番と同じ Unix ミリ秒
// - 円の欄（product / average_price / 未実現の手数料・利息・損益）は 4 桁で四捨五入して出す
//   （内部の完全精度の値に残る浮動小数の誤差を見せない）。数量の欄はそのまま
// - losscut_threshold（強制決済掛け目）は本番の値の単位を実口座で確かめていないので同名では出さない。
//   paper の値は assumptions.rules.losscutMultiplier
import type { PositionSide } from "../margin-operation.js";
import type { PaperState } from "../paper-state.js";
import { bookOf, hasMarginBook, isMarginStale, marginScannedAtMs } from "./book.js";
import { lockedAmountOf } from "./closable.js";
import { averagePrice, unrealizedPnl } from "./positions.js";
import { roundTo } from "./rounding.js";

export type MarginPositionsView = {
  notice: {
    what: "margin_call" | "debt";
    occurred_at: number | null;
    amount: number;
    due_date_at: number | null;
  } | null;
  payables: { amount: number };
  positions: Array<{
    pair: string;
    position_side: PositionSide;
    open_amount: number;
    locked_amount: number;
    product: number;
    average_price: number;
    unrealized_fee_amount: number;
    unrealized_interest_amount: number;
    opened_at: string;
    current_price: number | null;
    unrealized_profit_loss: number | null;
  }>;
  /** 信用の走査を済ませた時刻（margin.lastScanAt。現物の lastTickAt とは別） */
  last_scan_at: string;
  stale: boolean;
  assumptions: PaperState["margin"]["assumptions"];
};

export function buildMarginPositions(
  state: PaperState,
  prices: ReadonlyMap<string, number>,
  nowMs: number,
  pairFilter?: string,
): MarginPositionsView {
  const book = bookOf(state);
  const payables = book.jpy < 0 ? -book.jpy : 0;
  const notice: MarginPositionsView["notice"] =
    payables > 0
      ? { what: "debt", occurred_at: null, amount: payables, due_date_at: null }
      : book.call
        ? {
            what: "margin_call",
            occurred_at: Date.parse(book.call.judgedAt),
            amount: book.call.amount,
            due_date_at: Date.parse(book.call.deadline),
          }
        : null;
  const positions = book.positions
    .filter((p) => pairFilter === undefined || p.pair === pairFilter)
    .map((p) => {
      const px = prices.get(p.pair);
      return {
        pair: p.pair,
        position_side: p.positionSide,
        open_amount: p.openAmount,
        locked_amount: lockedAmountOf(book.orders, p.pair, p.positionSide),
        product: roundTo(p.product, 4),
        average_price: roundTo(averagePrice(p), 4),
        unrealized_fee_amount: roundTo(p.unrealizedFee, 4),
        unrealized_interest_amount: roundTo(p.unrealizedInterest, 4),
        opened_at: p.openedAt,
        current_price: px ?? null,
        unrealized_profit_loss: px === undefined ? null : roundTo(unrealizedPnl(p, px), 4),
      };
    });
  return {
    notice,
    payables: { amount: payables },
    positions,
    last_scan_at: new Date(marginScannedAtMs(state)).toISOString(),
    stale: hasMarginBook(state) && isMarginStale(state, nowMs),
    assumptions: state.margin.assumptions,
  };
}
