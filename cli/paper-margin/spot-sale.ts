// 追証の解消の行為としての現物の売却（ADR-010 決定 4 / docs/dev/paper-margin-plan.md §3.6）。純関数。
// 公表ルールの差入方法の「現物の売却」: JPY 建ての現物を売って JPY（差入保証金）が増えた直後に B ≥ Mm なら解消する。
// 価格の回復だけでは解消しないので、売りの「後」でなければ数えない。JPY 以外のペアの売りは JPY が増えないので数えない。
// - lazy tick で約定した指値の売り: 走査（scan-actions.ts の resolveBySpotSale）が、売りの約定時刻に、その時点の口座で判定する。
//   ここでは現物の約定履歴から、窓の中の売りの時刻と JPY の増減を組み立てるだけ（spotEventsSince）
// - 成行の売り（paper create-order）: 売った後の口座を現在値（ticker の last）で判定する。信用の状態が now まで
//   走査済みで、期限前のときだけ（古い状態で解消すると、期限切れで強制決済されるはずの追証を消してしまう）
import type { PaperHistoryEntry, PaperState } from "../paper-state.js";
import { bookOf, isMarginStale, withBook } from "./book.js";
import { isMarginCallExpired, resolvesAfterAction } from "./margin-call.js";
import type { MarginPairParams } from "./params.js";

/** 約定した現物の売買（JPY 建てかどうか・向き） */
type SpotSale = { pair: string; side: "buy" | "sell" };

/** 履歴から戻した JPY の増減と実際の増減の差の最大（下の spotEventsSince の説明。0.5 + 0.5） */
const ROUNDING_YEN = 1;

const raisesJpy = (f: SpotSale) => f.side === "sell" && f.pair.endsWith("_jpy");

/** 信用の走査の窓（fromMs より後）に約定した現物の、JPY の増減と、指値の売りの約定時刻（scan.ts に渡す）。
 *  現物の約定履歴から導くので、信用の走査に失敗した tick で約定した分も、次に走査できた tick で数えられる。
 *  JPY の増減は約定履歴の値から組み立てる。fees.ts の computeFill は、実際の増減を差引後の額のまま円に丸め
 *  （売り round(代金 − 手数料)・買い round(代金 + 手数料)）、履歴の手数料は手数料だけを丸めた round(手数料) を残す。
 *  「代金 ∓ 履歴の手数料」と実際の増減の差は、この 2 回の丸めの分で最大 1 円（ROUNDING_YEN）。評価が強制決済の早く起きる
 *  側にずれるよう、売りの代金は 1 円多め、買いの支払いは 1 円少なめに見積もる（その時刻より前の評価から除く額を大きめにする）。
 *  computeFill の丸め方を変えるときは、ROUNDING_YEN とこの上界も見直すこと。評価の時刻をずらすためだけに使い、残高は変えない。
 *  成行の売りも数える（売った時点で判定できなかった＝信用の状態が古い・
 *  パラメータや現在値を取れなかったときに、次の走査が売った時刻で判定する。判定済みなら追証はもう無い）。
 *  pending は、走査の窓より前に約定したのに、まだ解消の判定に使っていない売り（paper-fill.ts。現物の足だけ取れずに
 *  信用の走査が先へ進んだ後で約定が確定した分など）。窓の頭（fromMs）で判定する（判定が売りより遅れる近似）。
 *  追証の基準時より前に約定した pending は、呼び出し側（tick.ts）が先に除く（窓の頭に寄せると基準時より後に見えるため） */
export function spotEventsSince(
  history: readonly PaperHistoryEntry[],
  fromMs: number,
  pending: readonly string[] = [],
): { spotJpy: { atMs: number; delta: number }[]; spotSaleTimes: number[] } {
  const inWindow = history.filter(
    (h) => h.pair.endsWith("_jpy") && Date.parse(h.filledAt) >= fromMs,
  );
  const spotJpy = inWindow.map((h) => {
    const notional = h.amount * h.fillPrice;
    const delta =
      h.side === "sell"
        ? notional - h.feeQuote + ROUNDING_YEN
        : -(notional + h.feeQuote - ROUNDING_YEN);
    return { atMs: Date.parse(h.filledAt), delta };
  });
  const sold = inWindow.filter(raisesJpy).map((h) => Date.parse(h.filledAt));
  const late = pending.map((at) => Math.max(Date.parse(at), fromMs));
  const spotSaleTimes = [...new Set([...sold, ...late])].sort((a, b) => a - b);
  return { spotJpy, spotSaleTimes };
}

/** この tick で約定した現物のうち、追証の解消の行為になる売り（JPY 建て）の約定時刻 */
export function jpySaleTimes(fills: readonly PaperHistoryEntry[]): string[] {
  return fills.filter(raisesJpy).map((f) => f.filledAt);
}

/** 成行の現物の売りを反映した後の state で、追証が解けたか判定し、解けていれば消す */
export function resolveCallAfterSpotSale(
  state: PaperState,
  sale: SpotSale,
  ctx: {
    params: ReadonlyMap<string, Pick<MarginPairParams, "riskRatio">>;
    prices: ReadonlyMap<string, number>;
    nowMs: number;
  },
): { state: PaperState; resolved: boolean } {
  const call = state.margin.call;
  if (!call || !raisesJpy(sale)) return { state, resolved: false };
  if (isMarginStale(state, ctx.nowMs) || isMarginCallExpired(call, ctx.nowMs)) {
    return { state, resolved: false };
  }
  const ranges = new Map(
    [...ctx.prices].map(([pair, px]) => [pair, { low: px, high: px }] as const),
  );
  const book = bookOf(state);
  if (!resolvesAfterAction(book, ranges, ctx.params)) return { state, resolved: false };
  return { state: withBook(state, { ...book, call: null }), resolved: true };
}
