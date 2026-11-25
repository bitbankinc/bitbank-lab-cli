// paper create-margin-order の lock 内の処理（ADR-010 / docs/dev/paper-margin-plan.md §4 Step 5）。純関数。
// fresh な state を order-gate.ts の gateMarginOrder に通してから、指値なら margin.orders に積み
// （約定は lazy tick の走査で）、成行なら現在値で約定させる（market-fill.ts）。
import type { MarginOperation, OrderSide, PositionSide } from "../margin-operation.js";
import type { PaperState } from "../paper-state.js";
import type { Result } from "../types.js";
import { withBook } from "./book.js";
import type { MarginHistoryEntry } from "./history.js";
import { withLastParams } from "./last-params.js";
import { fillMarginMarket } from "./market-fill.js";
import { gateMarginOrder } from "./order-gate.js";
import type { MarginPairParams } from "./params.js";
import { findPosition } from "./positions.js";
import type { MarginOrder, MarginPosition } from "./state.js";

export type MarginOrderPlan = {
  pair: string;
  side: OrderSide;
  positionSide: PositionSide;
  type: "market" | "limit";
  amount: number;
  /** 指値のときだけ */
  price?: number;
  op: MarginOperation;
  /** 建玉のある全ペアと注文のペアの信用パラメータ・現在値（ticker の last） */
  params: ReadonlyMap<string, MarginPairParams>;
  prices: ReadonlyMap<string, number>;
  nowMs: number;
  newId: () => string;
};

export type PaperMarginFill = {
  operation: MarginOperation;
  fill: MarginHistoryEntry;
  /** 約定後の建玉（全量返済なら null） */
  position: MarginPosition | null;
  /** 約定後の JPY 残高（返済の損益を反映） */
  jpy: number;
  marginCallResolved: boolean;
};

export type PaperMarginPlaced = { operation: MarginOperation; placed: MarginOrder };

export function applyMarginOrder(
  state: PaperState | null,
  plan: MarginOrderPlan,
): Result<{ state: PaperState; result: PaperMarginFill | PaperMarginPlaced }> {
  const gate = gateMarginOrder(state, plan);
  if (!gate.success) return gate;
  const { book, unitPrice } = gate.data;
  const current = withLastParams(gate.data.state, plan.params);
  // lazy tick の後、lock を取るまでの間に別の tick が now より先まで走査を済ませていたら、注文・約定の時刻を
  // その走査済み時刻に揃える（古い時刻のまま記録すると、走査済みの区間がこの注文・建玉に対して評価されない）
  const scanned = current.margin.lastScanAt;
  const atMs = scanned === undefined ? plan.nowMs : Math.max(plan.nowMs, Date.parse(scanned));
  const at = new Date(atMs).toISOString();
  if (plan.type === "limit") {
    const placed: MarginOrder = {
      id: plan.newId(),
      pair: plan.pair,
      side: plan.side,
      positionSide: plan.positionSide,
      type: "limit",
      price: unitPrice,
      amount: plan.amount,
      createdAt: at,
    };
    const next = withBook(current, { ...book, orders: [...book.orders, placed] });
    return {
      success: true,
      data: { state: { ...next, updatedAt: at }, result: { operation: plan.op, placed } },
    };
  }
  const r = fillMarginMarket(current, { ...plan, nowMs: atMs, id: plan.newId() });
  if (!r.success) return r;
  const position =
    findPosition(r.data.state.margin.positions, plan.pair, plan.positionSide) ?? null;
  const jpy = r.data.state.balances.jpy ?? 0;
  const result = {
    operation: plan.op,
    fill: r.data.fill,
    position,
    jpy,
    marginCallResolved: r.data.marginCallResolved,
  };
  return { success: true, data: { state: { ...r.data.state, updatedAt: at }, result } };
}
