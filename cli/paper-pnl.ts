import type { PaperHistoryEntry } from "./paper-state.js";
import type { Result } from "./types.js";

export type PnlRow = {
  pair: string;
  position: number;
  avgCost: number;
  currentPrice: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
};

export type PaperPnlReport = {
  perPair: Record<string, PnlRow>;
  total: { realizedPnl: number; unrealizedPnl: number; totalPnl: number };
};

export type PositionState = {
  position: number;
  avgCost: number;
  realizedPnl: number;
};

export type ComputePnlInput = {
  history: PaperHistoryEntry[];
  tickerByPair: Record<string, number>;
  pairFilter?: string;
};

const EPS = 1e-12;

export function computePositions(
  history: PaperHistoryEntry[],
): Result<Record<string, PositionState>> {
  const pos: Record<string, PositionState> = {};
  for (const h of history) {
    if (h.amount <= 0) continue;
    const cur: PositionState = pos[h.pair] ?? { position: 0, avgCost: 0, realizedPnl: 0 };
    const perUnitFee = h.feeQuote / h.amount;
    if (h.side === "buy") {
      const newPos = cur.position + h.amount;
      cur.avgCost = (cur.avgCost * cur.position + (h.fillPrice + perUnitFee) * h.amount) / newPos;
      cur.position = newPos;
    } else {
      const newPos = cur.position - h.amount;
      if (newPos < -EPS) {
        return {
          success: false,
          error: `negative position detected for ${h.pair} (paper does not support short)`,
        };
      }
      cur.realizedPnl += (h.fillPrice - cur.avgCost) * h.amount - h.feeQuote;
      cur.position = newPos < 0 ? 0 : newPos;
    }
    pos[h.pair] = cur;
  }
  return { success: true, data: pos };
}

export function computePnl(input: ComputePnlInput): Result<PaperPnlReport> {
  const pr = computePositions(input.history);
  if (!pr.success) return pr;
  const perPair: Record<string, PnlRow> = {};
  let totalRealized = 0;
  let totalUnrealized = 0;
  for (const pair of Object.keys(pr.data).sort()) {
    if (input.pairFilter && pair !== input.pairFilter) continue;
    const p = pr.data[pair];
    if (Math.abs(p.position) < EPS && Math.abs(p.realizedPnl) < EPS) continue;
    const currentPrice = input.tickerByPair[pair] ?? 0;
    const unrealizedPnl = (currentPrice - p.avgCost) * p.position;
    const totalPnl = p.realizedPnl + unrealizedPnl;
    perPair[pair] = {
      pair,
      position: p.position,
      avgCost: p.avgCost,
      currentPrice,
      realizedPnl: p.realizedPnl,
      unrealizedPnl,
      totalPnl,
    };
    totalRealized += p.realizedPnl;
    totalUnrealized += unrealizedPnl;
  }
  return {
    success: true,
    data: {
      perPair,
      total: {
        realizedPnl: totalRealized,
        unrealizedPnl: totalUnrealized,
        totalPnl: totalRealized + totalUnrealized,
      },
    },
  };
}
