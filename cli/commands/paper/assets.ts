import { type FetchCandles, type GetPairs, runTick } from "../../paper-fill.js";
import { computeLocked, defaultStatePath, loadState } from "../../paper-state.js";
import type { Result } from "../../types.js";

export type PaperAssetRow = {
  asset: string;
  total: number;
  locked: number;
  available: number;
};

export type PaperAssetsArgs = {
  statePath?: string;
  fetchCandles?: FetchCandles;
  getPairs?: GetPairs;
  nowMs?: number;
  feeRate?: number;
};

export async function paperAssets(args: PaperAssetsArgs = {}): Promise<Result<PaperAssetRow[]>> {
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
  const locked = computeLocked(r.data, args.feeRate);
  const assets = new Set([...Object.keys(r.data.balances), ...Object.keys(locked)]);
  const rows: PaperAssetRow[] = [...assets].map((asset) => {
    const total = r.data?.balances[asset] ?? 0;
    const lockedAmt = locked[asset] ?? 0;
    return { asset, total, locked: lockedAmt, available: total - lockedAmt };
  });
  return { success: true, data: rows };
}
