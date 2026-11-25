// paper pnl の信用の欄（ADR-010 / docs/dev/paper-margin-plan.md §3.7）。純関数。
// 現物の perPair / total は変えない（現物の computePositions は信用の売りを売り越しとして拒否するので混ぜない）。
// 行は pair × position_side ごとで、現物の行と同じ欄に positionSide を足した形にする:
// - realizedPnl: 信用の約定履歴の profitLoss の合計（手数料・利息控除後。強制決済の決済も含む。本番の profit_loss と同じ定義）
// - unrealizedPnl: 建玉の値幅（現在値と平均建値の差 × 数量）から、未精算の手数料・利息を引いたもの。
//   現物の行が買いの手数料を avgCost に含めて評価損益を出すのと同じく、ここまでに掛かった費用を差し引く（返済時の手数料は含まない）
// - totalPnl = realizedPnl + unrealizedPnl
// 円の欄は margin-positions と同じく 4 桁で四捨五入する（内部の浮動小数の誤差を見せない）。合計は丸める前の値で足す。
import type { PositionSide } from "../margin-operation.js";
import type { PaperState } from "../paper-state.js";
import type { Result } from "../types.js";
import { averagePrice, unrealizedPnl } from "./positions.js";
import { roundTo } from "./rounding.js";

export type MarginPnlRow = {
  pair: string;
  positionSide: PositionSide;
  position: number;
  avgCost: number;
  currentPrice: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
};

export type MarginPnlReport = {
  perPosition: MarginPnlRow[];
  total: { realizedPnl: number; unrealizedPnl: number; totalPnl: number };
};

/** 信用の建玉も約定履歴も無ければ null（現物だけの口座の pnl の出力を変えない） */
export function computeMarginPnl(
  margin: PaperState["margin"],
  prices: ReadonlyMap<string, number>,
  pairFilter?: string,
): Result<MarginPnlReport | null> {
  if (margin.positions.length === 0 && margin.history.length === 0)
    return { success: true, data: null };
  const rows = new Map<string, MarginPnlRow>();
  const row = (pair: string, positionSide: PositionSide) => {
    const key = `${pair}:${positionSide}`;
    const cur = rows.get(key) ?? {
      pair,
      positionSide,
      position: 0,
      avgCost: 0,
      currentPrice: prices.get(pair) ?? 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      totalPnl: 0,
    };
    rows.set(key, cur);
    return cur;
  };
  const inScope = (pair: string) => pairFilter === undefined || pair === pairFilter;
  for (const h of margin.history)
    if (inScope(h.pair)) row(h.pair, h.positionSide).realizedPnl += h.profitLoss;
  for (const p of margin.positions) {
    if (!inScope(p.pair)) continue;
    const px = prices.get(p.pair);
    if (px === undefined)
      return { success: false, error: `failed to price margin position ${p.pair}` };
    const r = row(p.pair, p.positionSide);
    r.position = p.openAmount;
    r.avgCost = averagePrice(p);
    r.unrealizedPnl = unrealizedPnl(p, px) - p.unrealizedFee - p.unrealizedInterest;
  }
  const raw = [...rows.values()].sort(
    (a, b) => a.pair.localeCompare(b.pair) || a.positionSide.localeCompare(b.positionSide),
  );
  // 合計は丸める前の値で足してから 1 回だけ丸める（丸めた行を足すと、行の合計と TOTAL が 0.0001 ずれる）
  const perPosition = raw.map((r) => ({
    ...r,
    avgCost: roundTo(r.avgCost, 4),
    realizedPnl: roundTo(r.realizedPnl, 4),
    unrealizedPnl: roundTo(r.unrealizedPnl, 4),
    totalPnl: roundTo(r.realizedPnl + r.unrealizedPnl, 4),
  }));
  const realized = raw.reduce((sum, r) => sum + r.realizedPnl, 0);
  const unrealized = raw.reduce((sum, r) => sum + r.unrealizedPnl, 0);
  const total = {
    realizedPnl: roundTo(realized, 4),
    unrealizedPnl: roundTo(unrealized, 4),
    totalPnl: roundTo(realized + unrealized, 4),
  };
  return { success: true, data: { perPosition, total } };
}
