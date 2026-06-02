import { type FetchCandles, type GetPairs, runTick } from "../../paper-fill.js";
import { type OpenOrder, defaultStatePath, loadState } from "../../paper-state.js";
import type { Result } from "../../types.js";

export type PaperActiveOrdersArgs = {
  statePath?: string;
  fetchCandles?: FetchCandles;
  getPairs?: GetPairs;
  nowMs?: number;
  feeRate?: number;
};

export async function paperActiveOrders(
  args: PaperActiveOrdersArgs = {},
): Promise<Result<OpenOrder[]>> {
  const path = args.statePath ?? defaultStatePath();
  const tick = await runTick({
    statePath: path,
    fetchCandles: args.fetchCandles,
    getPairs: args.getPairs,
    nowMs: args.nowMs,
    feeRate: args.feeRate,
  });
  if (!tick.success) return tick;
  const r = await loadState(path);
  if (!r.success) return r;
  if (!r.data) {
    return {
      success: false,
      error: "paper state not initialized. Run 'bitbank paper init --jpy=<amount>' first.",
    };
  }
  return { success: true, data: r.data.openOrders };
}
