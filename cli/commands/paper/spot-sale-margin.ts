// 現物の成行の売り（paper create-order）で、発生中の追証が解けるかを判定するための、lock の外の取得
// （ADR-010 決定 4 / docs/dev/paper-margin-plan.md §3.6）。判定本体は paper-margin/spot-sale.ts（lock 内）。
// - 追証が発生中で、JPY 建ての売りのときだけ取る（それ以外の現物の注文には何もしない）
// - 建玉のある全ペアの信用パラメータ（pairs。読めなければ state の控え）と現在値（ticker）を取る
// - 取れなければ null（売り自体は止めない。追証は残る＝解消が遅れる側。margin-status で確かめられる）
import type { HttpOptions } from "../../http.js";
import { getPairsWithCache } from "../../pairs-cache.js";
import type { GetPairs } from "../../paper-fill.js";
import type { MarginPairParams } from "../../paper-margin/params.js";
import { resolveMarginParams } from "../../paper-margin-pairs.js";
import { loadState } from "../../paper-state.js";
import { fetchLastPrices } from "./last-prices.js";

export type SpotSaleMarginContext = {
  params: Map<string, MarginPairParams>;
  prices: Map<string, number>;
  nowMs: number;
};

export async function prepareSpotSaleMargin(
  path: string,
  sale: { pair: string; side: "buy" | "sell" },
  o: { nowMs: number; getPairs?: GetPairs; httpOptions?: HttpOptions },
): Promise<SpotSaleMarginContext | null> {
  if (sale.side !== "sell" || !sale.pair.endsWith("_jpy")) return null;
  const peek = await loadState(path);
  if (!peek.success || !peek.data?.margin.call) return null;
  const held = [...new Set(peek.data.margin.positions.map((p) => p.pair))];
  const params = await resolveMarginParams(held, {
    nowMs: o.nowMs,
    getPairs: o.getPairs ?? (() => getPairsWithCache({ httpOptions: o.httpOptions })),
    refreshPairs:
      o.getPairs ?? (() => getPairsWithCache({ refresh: true, httpOptions: o.httpOptions })),
    lastKnown: peek.data.margin.lastParams,
  });
  if (!params.success) return null;
  const prices = await fetchLastPrices(held, o.httpOptions);
  if (!prices.success) return null;
  return { params: params.data.params, prices: prices.data, nowMs: o.nowMs };
}
