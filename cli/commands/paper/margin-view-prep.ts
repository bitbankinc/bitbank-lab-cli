// paper margin-status / margin-positions の共通の準備（ADR-010 / docs/dev/paper-margin-plan.md §3.7）。
// lazy tick → state を読む → 信用対応の全ペアのパラメータ（建玉・注文のペアは pairs か state の控えから。どちらにも
// 無ければ失敗）→
// 建玉のあるペアの現在値（ticker の last）。public の API だけを叩く。
import type { HttpOptions } from "../../http.js";
import { type CachedPair, getPairsWithCache } from "../../pairs-cache.js";
import { type FetchCandles, type GetPairs, runTick } from "../../paper-fill.js";
import { type MarginPairParams, marginParamsOf } from "../../paper-margin/params.js";
import { resolveMarginParams } from "../../paper-margin-pairs.js";
import { defaultStatePath, loadState, type PaperState } from "../../paper-state.js";
import type { Result } from "../../types.js";
import { fetchLastPrices } from "./last-prices.js";

export type MarginViewArgs = {
  statePath?: string;
  fetchCandles?: FetchCandles;
  fetchCoarseCandles?: FetchCandles;
  getPairs?: GetPairs;
  nowMs?: number;
};

export type MarginView = {
  path: string;
  nowMs: number;
  state: PaperState;
  params: Map<string, MarginPairParams>;
  prices: Map<string, number>;
};

export async function prepareMarginView(
  args: MarginViewArgs,
  opts?: HttpOptions,
): Promise<Result<MarginView>> {
  const path = args.statePath ?? defaultStatePath();
  const nowMs = args.nowMs ?? Date.now();
  const tick = await runTick({
    statePath: path,
    fetchCandles: args.fetchCandles,
    fetchCoarseCandles: args.fetchCoarseCandles,
    getPairs: args.getPairs,
    nowMs,
  });
  if (!tick.success) return tick;
  const loaded = await loadState(path);
  if (!loaded.success) return loaded;
  const state = loaded.data;
  if (!state) {
    return {
      success: false,
      error: "paper state not initialized. Run 'bitbank paper init --jpy=<amount>' first.",
    };
  }
  const getPairs = args.getPairs ?? (() => getPairsWithCache({ httpOptions: opts }));
  const refreshPairs =
    args.getPairs ?? (() => getPairsWithCache({ refresh: true, httpOptions: opts }));
  const held = [...new Set(state.margin.positions.map((p) => p.pair))];
  const booked = [...new Set([...held, ...state.margin.orders.map((o) => o.pair)])];
  const required = await resolveMarginParams(booked, {
    ...{ nowMs, getPairs, refreshPairs },
    lastKnown: state.margin.lastParams,
  });
  if (!required.success) return required;
  const listed = await getPairs();
  if (!listed.success) return listed;
  // 控えを使ったペアは assumptions.riskRatios の source が last-known になる（status.ts）
  const params = new Map([...allMarginParams(listed.data, nowMs), ...required.data.params]);
  const prices = await fetchLastPrices(held, opts);
  if (!prices.success) return prices;
  return { success: true, data: { path, nowMs, state, params, prices: prices.data } };
}

/** pairs に載っている信用対応ペアのうち、パラメータが読めるもの（available_balances 用。読めないペアは載せない） */
function allMarginParams(
  pairs: readonly CachedPair[],
  nowMs: number,
): Map<string, MarginPairParams> {
  const out = new Map<string, MarginPairParams>();
  for (const p of pairs) {
    const r = marginParamsOf(p, nowMs);
    if (r.kind === "ok") out.set(p.name, r.params);
  }
  return out;
}
