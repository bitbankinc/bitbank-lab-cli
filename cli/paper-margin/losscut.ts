// paper の信用の強制決済（ADR-010 決定 4 / docs/dev/paper-margin-plan.md §2.3・§3.5）。純関数。
// 公表ルール: 発動すると新規発注中の注文を取り消し、保有中の建玉すべてを成行で決済する。
// paper は足の中のどの時点で発動したかを知らないので、強制決済が早く・不利に起きる側に倒す:
// - 判定に使う価格は、ペアごとに足の安値・高値のうち、そのペアの建玉の評価損益が小さくなる方
//   （ロングだけなら安値、ショートだけなら高値。両建てなら両方を試して悪い方）
// - 決済価格も同じ価格にする（急変時に成行の強制決済が滑る分を見込む）。手数料は決済の taker 率
// - 返済注文も建玉が消えるので一緒に取り消す。現物の注文には触れない（MarginBook は信用の注文だけを持つ）
// 決済の前に、その時刻までの利息を積んでおくこと（applyClose が積み残しを拒否する）。
import type { Candle } from "../commands/public/candles-fetch.js";
import { snapAmount } from "../paper-precision.js";
import type { Result } from "../types.js";
import { applyClose, type CloseSettlement } from "./close.js";
import { unrealizedPnl } from "./positions.js";
import type { MarginBook, MarginOrder, MarginPosition } from "./state.js";

export type PriceRange = Pick<Candle, "low" | "high">;

export type LosscutClose = {
  position: MarginPosition;
  price: number;
  fee: number;
  settlement: CloseSettlement;
};

/** 建玉のあるペアごとに、判定と決済に使う価格（安値・高値のうち評価損益が小さくなる方） */
export function worstPrices(
  positions: readonly MarginPosition[],
  ranges: ReadonlyMap<string, PriceRange>,
): Result<Map<string, number>> {
  const out = new Map<string, number>();
  for (const pair of new Set(positions.map((p) => p.pair))) {
    const range = ranges.get(pair);
    if (!range) return { success: false, error: `losscut: no price range for ${pair}` };
    const held = positions.filter((p) => p.pair === pair);
    const pnlAt = (px: number) => held.reduce((sum, p) => sum + unrealizedPnl(p, px), 0);
    out.set(pair, pnlAt(range.low) <= pnlAt(range.high) ? range.low : range.high);
  }
  return { success: true, data: out };
}

/** 全建玉を prices で決済し、信用の注文をすべて取り消し、追証を消す。損益は JPY 残高に足す。
 *  決済で JPY 残高が負になれば、それが不足金になる（呼び出し側が DEBT として扱う）。 */
export function executeLosscut(
  book: MarginBook,
  prices: ReadonlyMap<string, number>,
  closeTakerRate: (pair: string) => number | undefined,
  at: string,
): Result<{ book: MarginBook; closes: LosscutClose[]; canceled: MarginOrder[] }> {
  let positions = book.positions;
  let jpy = book.jpy;
  const closes: LosscutClose[] = [];
  for (const p of book.positions) {
    const price = prices.get(p.pair);
    const rate = closeTakerRate(p.pair);
    if (price === undefined || rate === undefined) {
      return { success: false, error: `losscut: no price or close taker rate for ${p.pair}` };
    }
    const fee = snapAmount(p.openAmount * price * rate);
    const fill = {
      pair: p.pair,
      positionSide: p.positionSide,
      amount: p.openAmount,
      price,
      fee,
      at,
    };
    const r = applyClose(positions, fill);
    if (!r.success) return r;
    positions = r.data.positions;
    jpy = snapAmount(jpy + r.data.settlement.profitLoss);
    closes.push({ position: p, price, fee, settlement: r.data.settlement });
  }
  return {
    success: true,
    data: { book: { jpy, positions, orders: [], call: null }, closes, canceled: book.orders },
  };
}
