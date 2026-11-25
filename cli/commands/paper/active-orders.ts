// 現物の未約定注文（openOrders）と信用の未約定注文（margin.orders。ADR-010）をまとめて作成順に返す。
// 信用の注文には positionSide が付き、現物の注文には付かない（本番の API も現物の行は position_side のキー自体が無い）。
import { type FetchCandles, type GetPairs, runTick } from "../../paper-fill.js";
import type { MarginOrder } from "../../paper-margin/state.js";
import { withStatePath } from "../../paper-result.js";
import { defaultStatePath, loadState, type OpenOrder } from "../../paper-state.js";
import type { Result } from "../../types.js";

export type PaperActiveOrdersArgs = {
  statePath?: string;
  fetchCandles?: FetchCandles;
  getPairs?: GetPairs;
  nowMs?: number;
  feeRate?: number;
};

export type PaperActiveOrder = OpenOrder | MarginOrder;

export async function paperActiveOrders(
  args: PaperActiveOrdersArgs = {},
): Promise<Result<PaperActiveOrder[]>> {
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
  const margin = r.data.margin.orders;
  // 表（--format=table / csv）は先頭行のキーで列を決めるので、信用の注文が混じるときは現物の行にも
  // positionSide のキーを undefined で持たせて列を出す（JSON では undefined は出力されない）。
  const spot =
    margin.length > 0
      ? r.data.openOrders.map((o) => ({ ...o, positionSide: undefined }))
      : r.data.openOrders;
  const orders: PaperActiveOrder[] = [...spot, ...margin].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  return withStatePath({ success: true, data: orders }, path);
}
