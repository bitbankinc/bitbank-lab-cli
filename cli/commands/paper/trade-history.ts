// 現物の約定（history）と信用の約定（margin.history。ADR-010）を時刻順にまとめて返す。信用の約定が無ければ出力は従来どおり。
// 欄は現物と信用で違う（現物は feeQuote、信用は positionSide / feeOccurred / feeCharged / profitLoss / interest）。
// 表（--format=table / csv）は先頭行のキーで列を決めるので、混在時は全行に全部のキーを同じ順で持たせる
// （無い欄は undefined。JSON には出ない）。
import { type FetchCandles, type GetPairs, runTick } from "../../paper-fill.js";
import type { MarginHistoryEntry } from "../../paper-margin/history.js";
import { withStatePath } from "../../paper-result.js";
import { defaultStatePath, loadState, type PaperHistoryEntry } from "../../paper-state.js";
import type { Result } from "../../types.js";

export type PaperTradeHistoryArgs = {
  statePath?: string;
  fetchCandles?: FetchCandles;
  getPairs?: GetPairs;
  nowMs?: number;
  feeRate?: number;
};

export type PaperTradeHistoryRow = PaperHistoryEntry | MarginHistoryEntry;

const KEYS = [
  "id",
  "pair",
  "side",
  "positionSide",
  "type",
  "amount",
  "fillPrice",
  "feeQuote",
  "feeOccurred",
  "feeCharged",
  "profitLoss",
  "interest",
  "filledAt",
] as const;

function merged(spot: PaperHistoryEntry[], margin: MarginHistoryEntry[]): PaperTradeHistoryRow[] {
  if (margin.length === 0) return spot;
  const rows: PaperTradeHistoryRow[] = [...spot, ...margin].sort(
    (a, b) => Date.parse(a.filledAt) - Date.parse(b.filledAt),
  );
  return rows.map(
    (row) =>
      Object.fromEntries(
        KEYS.map((k) => [k, (row as Record<string, unknown>)[k]]),
      ) as PaperTradeHistoryRow,
  );
}

export async function paperTradeHistory(
  args: PaperTradeHistoryArgs = {},
): Promise<Result<PaperTradeHistoryRow[]>> {
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
  return withStatePath(
    { success: true, data: merged(r.data.history, r.data.margin.history) },
    path,
  );
}
