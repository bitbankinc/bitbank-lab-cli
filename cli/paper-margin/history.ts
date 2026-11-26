// paper の信用の約定履歴（ADR-010 / docs/dev/paper-margin-plan.md §2.4・§3.7）。
// 現物の history とは別の配列に持つ（現物の computePositions が信用の売りを売り越しとして拒否するため）。
// 手数料・損益の欄は本番 trade-history の信用行に合わせる（docs/dev/tax-evidence/ANSWERS.md §4）:
// - 新規建て: feeOccurred = この約定の手数料、feeCharged = 0、profitLoss = 0、interest = 0
// - 返済: feeCharged = 按分した新規建て分 + 返済分、profitLoss = 手数料・利息控除後、interest = 精算した利息
// - 強制決済の決済は type = "losscut"（本番の約定履歴の type にも現れる）
import { z } from "zod";
import { PositionSideSchema } from "../margin-operation.js";
import type { MarginFillEvent } from "./fills.js";
import type { LosscutClose } from "./losscut.js";

export const MarginHistoryEntrySchema = z.object({
  id: z.string(),
  pair: z.string(),
  side: z.enum(["buy", "sell"]),
  positionSide: PositionSideSchema,
  type: z.enum(["market", "limit", "losscut"]),
  amount: z.number().positive(),
  fillPrice: z.number().positive(),
  /** この約定で発生した手数料（本番の fee_occurred_amount_quote）。リベートなら負 */
  feeOccurred: z.number(),
  /** この約定で徴収した手数料（本番の fee_amount_quote） */
  feeCharged: z.number(),
  /** 確定損益（本番の profit_loss）。新規建ては 0 */
  profitLoss: z.number(),
  /** 精算した利息（本番の interest）。新規建ては 0 */
  interest: z.number(),
  filledAt: z.string(),
});

export type MarginHistoryEntry = z.infer<typeof MarginHistoryEntrySchema>;

/** 指値の約定（scan.ts の fill イベント）を履歴の 1 行にする */
export function historyOfFill(e: MarginFillEvent): MarginHistoryEntry {
  const s = e.settlement;
  return {
    id: e.order.id,
    pair: e.order.pair,
    side: e.order.side,
    positionSide: e.order.positionSide,
    type: "limit",
    amount: e.order.amount,
    fillPrice: e.order.price,
    feeOccurred: e.fee,
    feeCharged: s ? s.feeCharged : 0,
    profitLoss: s ? s.profitLoss : 0,
    interest: s ? s.interestCharged : 0,
    filledAt: e.at,
  };
}

/** 強制決済の決済 1 本を履歴の 1 行にする。売買の向きは建玉の反対（ロングは売り、ショートは買い） */
export function historyOfLosscut(c: LosscutClose, id: string, at: string): MarginHistoryEntry {
  return {
    id,
    pair: c.position.pair,
    side: c.position.positionSide === "long" ? "sell" : "buy",
    positionSide: c.position.positionSide,
    type: "losscut",
    amount: c.position.openAmount,
    fillPrice: c.price,
    feeOccurred: c.fee,
    feeCharged: c.settlement.feeCharged,
    profitLoss: c.settlement.profitLoss,
    interest: c.settlement.interestCharged,
    filledAt: at,
  };
}
