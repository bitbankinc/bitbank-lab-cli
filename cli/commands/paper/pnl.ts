// 100行超: paper の損益集計コマンド本体。ticker 並列 fetch、JPY 以外の
// ペア除外、computePnl 呼び出し、format 別出力を 1 ファイルに集約。
import { machineOutput } from "../../output.js";
import { type FetchCandles, type GetPairs, runTick } from "../../paper-fill.js";
import { computePnl, type PaperPnlReport } from "../../paper-pnl.js";
import { defaultStatePath, loadState } from "../../paper-state.js";
import type { Format, Result } from "../../types.js";
import { ticker } from "../public/ticker.js";

export type FetchTicker = (pair: string) => Promise<Result<number>>;

export type PaperPnlArgs = {
  pair?: string;
  statePath?: string;
  fetchCandles?: FetchCandles;
  getPairs?: GetPairs;
  fetchTicker?: FetchTicker;
  nowMs?: number;
  feeRate?: number;
};

export async function paperPnl(args: PaperPnlArgs = {}): Promise<Result<PaperPnlReport>> {
  const path = args.statePath ?? defaultStatePath();
  const tick = await runTick({
    statePath: path,
    fetchCandles: args.fetchCandles,
    getPairs: args.getPairs,
    nowMs: args.nowMs,
    feeRate: args.feeRate,
  });
  if (!tick.success) return tick;
  const sr = await loadState(path);
  if (!sr.success) return sr;
  if (!sr.data) {
    return {
      success: false,
      error: "paper state not initialized. Run 'bitbank paper init --jpy=<amount>' first.",
    };
  }
  if (args.pair && !args.pair.endsWith("_jpy")) {
    return { success: false, error: `--pair must be a JPY pair: ${args.pair}` };
  }
  const allPairs = new Set<string>();
  for (const h of sr.data.history) allPairs.add(h.pair);
  const excluded = [...allPairs].filter((p) => !p.endsWith("_jpy")).sort();
  if (excluded.length > 0) {
    process.stderr.write(`Warning: non-JPY pairs excluded from P&L: ${excluded.join(", ")}\n`);
  }
  const jpyHistory = sr.data.history.filter((h) => h.pair.endsWith("_jpy"));
  const jpyPairs = [...allPairs].filter((p) => p.endsWith("_jpy"));
  const targetPairs = args.pair ? jpyPairs.filter((p) => p === args.pair) : jpyPairs;
  const fetchFn = args.fetchTicker ?? defaultFetchTicker;
  const results = await Promise.all(
    targetPairs.map(async (p) => ({ pair: p, r: await fetchFn(p) })),
  );
  const tickerByPair: Record<string, number> = {};
  for (const { pair, r } of results) {
    if (!r.success) {
      return { success: false, error: `failed to fetch ticker for ${pair}: ${r.error}` };
    }
    tickerByPair[pair] = r.data;
  }
  return computePnl({ history: jpyHistory, tickerByPair, pairFilter: args.pair });
}

async function defaultFetchTicker(pair: string): Promise<Result<number>> {
  const r = await ticker({ pair });
  if (!r.success) return r;
  if (!r.data.last) return { success: false, error: "ticker has no last" };
  const n = Number(r.data.last);
  if (!Number.isFinite(n) || n <= 0) {
    return { success: false, error: `invalid ticker last: ${r.data.last}` };
  }
  return { success: true, data: n };
}

const COLS = [
  "pair",
  "position",
  "avgCost",
  "currentPrice",
  "realizedPnl",
  "unrealizedPnl",
  "totalPnl",
] as const;

export function formatPnl(
  result: Result<PaperPnlReport>,
  format: Format,
  raw = false,
  machine = false,
): void {
  if (machine) {
    machineOutput(result);
    return;
  }
  if (!result.success) {
    process.stderr.write(`Error: ${result.error}\n`);
    process.exitCode = result.exitCode ?? 1;
    return;
  }
  const data = result.data;
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(data, raw ? undefined : null, raw ? undefined : 2)}\n`);
    return;
  }
  const pairRows = Object.values(data.perPair).map((r) => COLS.map((c) => String(r[c])));
  if (format === "csv") {
    process.stdout.write(`${[COLS.join(","), ...pairRows.map((r) => r.join(","))].join("\n")}\n`);
    return;
  }
  const totalRow = [
    "TOTAL",
    "",
    "",
    "",
    String(data.total.realizedPnl),
    String(data.total.unrealizedPnl),
    String(data.total.totalPnl),
  ];
  const widths = COLS.map((c) => c.length);
  for (const row of [...pairRows, totalRow]) {
    for (let i = 0; i < COLS.length; i++) {
      if (row[i].length > widths[i]) widths[i] = row[i].length;
    }
  }
  const sep = widths.map((w) => "-".repeat(w)).join("  ");
  const parts = [
    COLS.map((c, i) => c.padEnd(widths[i])).join("  "),
    sep,
    ...pairRows.map((row) => row.map((s, i) => s.padEnd(widths[i])).join("  ")),
    sep,
    totalRow.map((s, i) => s.padEnd(widths[i])).join("  "),
  ];
  process.stdout.write(`${parts.join("\n")}\n`);
}
