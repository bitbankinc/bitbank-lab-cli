// 100行超: 本番 margin-status と対応づけた出力型（各フィールドに対応する API 名を注記）と、それを埋める
// 算式を 1 か所に置く。型と算式を分けると、どの値がどの公表ルールの項目かを読むのに 2 ファイルを往復するため。
//
// paper の信用の口座評価（ADR-010 / docs/dev/paper-margin-plan.md §2.3・§3.4）。純関数。
// bitbank の信用取引ルール・契約締結前交付書面の算式どおりに、建玉単位ではなく口座単位で計算する:
//   受入保証金合計額 B = 差入保証金 D + 建玉評価損益 U − 未収費用 C
//   維持必要保証金額 Mm = Σ 建玉数量 × 平均建値 × リスク想定比率
//   約定時必要保証金額 Mo = Σ 新規建て指値数量 × 指値価格 × リスク想定比率
//   保証金率 = B ÷ 建玉（保有分）P。P は建値基準（Σ product）
// - v1 の差入保証金は JPY 残高だけ（代用暗号資産を入れない。保証金を少なく見積もる安全側）。負なら不足金
// - 評価時の価格は呼び出し側が渡す（v1 は ticker の last。強制決済の判定では足の不利な極値。#PM-4）
// - 数値は完全精度のまま。API と同じ桁の丸め（保証金率は切り捨て 2 桁など）は出力側で行う
// フィールド名は本番 margin-status の名前を camelCase にしたもの（出力側の写像を機械的にするため）。
// 追証・強制決済の判定基準は conditions.ts、新規建ての可否は new-open.ts。
import { marginOperation, type PositionSide } from "../margin-operation.js";
import { snapAmount } from "../paper-precision.js";
import type { Result } from "../types.js";
import type { MarginOrderLike } from "./closable.js";
import { unrealizedPnl } from "./positions.js";
import type { MarginPosition } from "./state.js";

/** 未約定の注文。新規建て（open）の信用注文だけが約定時必要保証金に入る */
export type PendingMarginOrder = MarginOrderLike & { price: number };

export type AccountInput = {
  /** JPY 残高 = 差入保証金（v1 は保証金現金だけ）。負なら不足金 */
  jpy: number;
  positions: readonly MarginPosition[];
  openOrders: readonly PendingMarginOrder[];
  riskRatio: (pair: string) => number | undefined;
  /** 評価時の価格。強制決済の判定ではロングとショートで違う価格を渡せる */
  price: (pair: string, positionSide: PositionSide) => number | undefined;
};

export type MarginAccount = {
  /** D: 差入保証金 */
  collateral: number;
  /** P: 建玉（保有分）。本番の open_margin_position_product */
  openPositionProduct: number;
  /** U: 建玉評価損益。本番の margin_position_profit_loss */
  positionProfitLoss: number;
  /** C: 未収費用（未精算の手数料 + 利息）。本番の unrealized_cost */
  unrealizedCost: number;
  /** B: 受入保証金合計額。本番の total_margin_balance */
  totalMarginBalance: number;
  /** Mm: 維持必要保証金額。本番の total_position_maintenance_margin */
  positionMaintenanceMargin: number;
  /** 新規建て発注中の注文金額。本番の open_margin_order_product */
  openOrderProduct: number;
  /** Mo: 約定時必要保証金額。本番の total_open_order_maintenance_margin */
  openOrderMaintenanceMargin: number;
  /** B ÷ P。建玉が無ければ null（本番の total_margin_balance_percentage も null） */
  marginRatio: number | null;
  /** 不足金 = max(0, −D)。本番の payables.amount */
  payables: number;
};

export function evaluateAccount(input: AccountInput): Result<MarginAccount> {
  const missing = new Set<string>();
  let held = 0;
  let pnl = 0;
  let cost = 0;
  let maintenance = 0;
  for (const p of input.positions) {
    const r = input.riskRatio(p.pair);
    const px = input.price(p.pair, p.positionSide);
    if (r === undefined) missing.add(`risk ratio of ${p.pair}`);
    if (px === undefined || !(px > 0)) missing.add(`price of ${p.pair} (${p.positionSide})`);
    if (r === undefined || px === undefined || !(px > 0)) continue;
    held += p.product;
    pnl += unrealizedPnl(p, px);
    cost += p.unrealizedFee + p.unrealizedInterest;
    maintenance += p.product * r;
  }
  let orderProduct = 0;
  let orderMargin = 0;
  for (const o of input.openOrders) {
    if (o.positionSide === undefined) continue; // 現物
    if (marginOperation(o.side, o.positionSide).intent !== "open") continue;
    const r = input.riskRatio(o.pair);
    if (r === undefined) {
      missing.add(`risk ratio of ${o.pair}`);
      continue;
    }
    orderProduct += o.amount * o.price;
    orderMargin += o.amount * o.price * r;
  }
  if (missing.size > 0) {
    return { success: false, error: `margin account: missing ${[...missing].join(", ")}` };
  }
  const balance = input.jpy + pnl - cost;
  return {
    success: true,
    data: {
      collateral: input.jpy,
      openPositionProduct: snapAmount(held),
      positionProfitLoss: snapAmount(pnl),
      unrealizedCost: snapAmount(cost),
      totalMarginBalance: snapAmount(balance),
      positionMaintenanceMargin: snapAmount(maintenance),
      openOrderProduct: snapAmount(orderProduct),
      openOrderMaintenanceMargin: snapAmount(orderMargin),
      marginRatio: held > 0 ? balance / held : null,
      payables: input.jpy < 0 ? -input.jpy : 0,
    },
  };
}
