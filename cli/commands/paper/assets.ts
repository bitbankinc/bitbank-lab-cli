// paper assets は現物の残高（total / locked / available）を出す。信用（ADR-010）の必要保証金はここで locked に含めない:
// available は現物の注文が実際に使える額（現物の発注チェックと同じ computeLocked）で、本番も現物の取引を信用の必要保証金で
// 止めない（約定で受入保証金合計額が下がれば追証・強制決済の対象になるだけ。契約締結前交付書面）。ここで差し引くと、
// 表示と現物の注文の可否が食い違う。信用の必要保証金と新規建て可能額は paper margin-status で見る。
import { makerRateResolver } from "../../fees.js";
import { getPairsWithCache } from "../../pairs-cache.js";
import { type FetchCandles, type GetPairs, runTick } from "../../paper-fill.js";
import { withStatePath } from "../../paper-result.js";
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
  // 買い指値ロックは maker 基準で見積もる。feeRate override 時はそれを最優先し
  // pairs 取得をスキップ。未指定かつ買い指値があるときだけ per-pair maker を引く。
  let fee: number | ((pair: string) => number) | undefined = args.feeRate;
  if (args.feeRate === undefined && r.data.openOrders.some((o) => o.side === "buy")) {
    const pairsR = args.getPairs
      ? await args.getPairs()
      : await getPairsWithCache({ nowMs: args.nowMs });
    if (pairsR.success) {
      fee = makerRateResolver(pairsR.data);
    } else {
      // pairs 取得失敗時は runTick と同様に警告し、安全側の taker 既定へフォールバック
      // する（買い指値ロックは過大見積りになるが available を過大表示しない）。
      process.stderr.write(`Warning: fetch pairs for lock estimate failed: ${pairsR.error}\n`);
    }
  }
  const locked = computeLocked(r.data, fee);
  const assets = new Set([...Object.keys(r.data.balances), ...Object.keys(locked)]);
  const rows: PaperAssetRow[] = [...assets].map((asset) => {
    const total = r.data?.balances[asset] ?? 0;
    const lockedAmt = locked[asset] ?? 0;
    return { asset, total, locked: lockedAmt, available: total - lockedAmt };
  });
  return withStatePath({ success: true, data: rows }, path);
}
