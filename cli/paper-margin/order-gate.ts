// paper create-margin-order の lock 内の門番（ADR-010 / docs/dev/paper-margin-plan.md §4 Step 5）。純関数。
// fresh な state に対して、初期化済みか → 信用の状態が最新か → 口座の評価 → 受け付けてよいか（order-checks.ts）を順に見る。
// 「信用の状態が最新か」: 直前の lazy tick が now まで信用を走査できたこと（margin.lastScanAt ≥ now。book.ts）を求める。
// 走査できていない（足の取得失敗など）のに受け付けると、強制決済されるべき口座に新しい注文を足してしまうおそれがある。
// 建玉・注文がまだ無い口座でも求める。走査済み時刻が古いまま建てると、次の tick がその時刻から走査し、
// 建てる前の足でこの建玉を評価してしまう（建玉が無ければ lazy tick は必ず now まで進めるので、通常は通る）。
import type { PaperState } from "../paper-state.js";
import type { Result } from "../types.js";
import { evaluateAccount } from "./account.js";
import { bookOf, isMarginStale } from "./book.js";
import type { MarginOrderPlan } from "./order.js";
import { checkMarginOrder } from "./order-checks.js";
import type { MarginBook } from "./state.js";

/** lock 内の門番。通ったら、注文の単価（指値 or 現在値）と、評価に使った book を返す */
export function gateMarginOrder(
  state: PaperState | null,
  plan: MarginOrderPlan,
): Result<{ state: PaperState; book: MarginBook; unitPrice: number }> {
  if (!state) {
    return {
      success: false,
      error: "paper state not initialized. Run 'bitbank paper init --jpy=<amount>' first.",
    };
  }
  if (isMarginStale(state, plan.nowMs)) {
    return {
      success: false,
      error:
        "信用の状態を最新にできませんでした（直前の tick で足や pairs を取れなかった）。少し待ってから再実行してください",
    };
  }
  const book = bookOf(state);
  const pairParams = plan.params.get(plan.pair);
  const unitPrice = plan.type === "limit" ? plan.price : plan.prices.get(plan.pair);
  if (!pairParams || unitPrice === undefined) {
    return { success: false, error: `margin order: no params or price for ${plan.pair}` };
  }
  const account = evaluateAccount({
    jpy: book.jpy,
    positions: book.positions,
    openOrders: book.orders,
    riskRatio: (p) => plan.params.get(p)?.riskRatio,
    price: (p) => plan.prices.get(p),
  });
  if (!account.success) return account;
  const req = {
    pair: plan.pair,
    side: plan.side,
    positionSide: plan.positionSide,
    amount: plan.amount,
    notional: plan.amount * unitPrice,
  };
  const check = checkMarginOrder({
    book,
    op: plan.op,
    req,
    riskRatio: pairParams.riskRatio,
    account: account.data,
  });
  if (!check.success) return check;
  return { success: true, data: { state, book, unitPrice } };
}
