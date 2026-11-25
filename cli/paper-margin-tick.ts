// paper の lazy tick のうち、信用の走査に要る足と pairs を lock の外で取ってくる
// （ADR-010 決定 4 / docs/dev/paper-margin-plan.md §3.5）。state の更新は cli/paper-margin/tick.ts（lock 内）。
// - 信用の建玉か注文があるときだけ動く（現物だけの口座では何も取らない）
// - 窓の始点は信用の走査を済ませた時刻（margin.lastScanAt。現物の lastTickAt とは別。paper-margin/book.ts）
// - 前回の走査から 24h 以内は 1min 足、超えたら窓全体を 4hour 足（年単位ファイル）で取り、approximate を立てる。
//   現物の指値のように 24h で打ち切らない（強制決済の見逃しは静かな誤りになるため）
// - 足は前回の走査を足の区切りに揃えた時刻から取り、さらに少し前から取って直前の終値を持たせる
// - pairs → ペアごとの信用パラメータは paper-margin-pairs.ts（読めなくなったペアは state の控えで埋めて申告する）
// - 取得や判定に失敗したら failed を返す。runTick は信用の走査をせず margin.lastScanAt も進めない（次の tick で取り直す）
import type { Candle } from "./commands/public/candles-fetch.js";
import type { HttpOptions } from "./http.js";
import { type CachedPair, getPairsWithCache } from "./pairs-cache.js";
import { hasMarginBook, marginScannedAtMs } from "./paper-margin/book.js";
import type { MarginTickInput } from "./paper-margin/tick.js";
import { fetchCoarseCandles } from "./paper-margin-candles.js";
import { fallbackWarning, resolveMarginParams } from "./paper-margin-pairs.js";
import type { PaperState } from "./paper-state.js";
import type { Result } from "./types.js";

type Fetch = (pair: string, fromMs: number, toMs: number) => Promise<Result<Candle[]>>;
type GetPairs = () => Promise<Result<CachedPair[]>>;

const MIN_MS = 60_000;
const FOUR_HOURS_MS = 4 * 60 * MIN_MS;
const ONE_DAY_MS = 24 * 60 * MIN_MS;

export type MarginTickPrep =
  | { kind: "none"; warnings: string[] }
  | { kind: "failed"; warnings: string[] }
  | { kind: "ready"; input: MarginTickInput; warnings: string[] };

export type PrepareMarginTickOptions = {
  nowMs: number;
  /** --pair の部分 tick なら回さない（信用は口座全体で評価するため） */
  pair?: string;
  fetchCandles: Fetch;
  fetchCoarseCandles?: Fetch;
  /** テスト用の注入口。無ければ pairs キャッシュ（比率の期限切れで取り直すときは refresh） */
  getPairs?: GetPairs;
  httpOptions?: HttpOptions;
};

export async function prepareMarginTick(
  state: PaperState,
  o: PrepareMarginTickOptions,
): Promise<MarginTickPrep> {
  if (!hasMarginBook(state)) return { kind: "none", warnings: [] };
  if (o.pair !== undefined) {
    return {
      kind: "none",
      warnings: ["margin: skipped for --pair (the margin account is evaluated across all pairs)"],
    };
  }
  const pairs = [
    ...new Set([...state.margin.positions, ...state.margin.orders].map((x) => x.pair)),
  ];
  const fromMs = Math.min(marginScannedAtMs(state), o.nowMs);
  const approximate = o.nowMs - fromMs > ONE_DAY_MS;
  const period = approximate ? FOUR_HOURS_MS : MIN_MS;
  const candleFromMs = Math.floor(fromMs / period) * period;
  const fetch = approximate
    ? (o.fetchCoarseCandles ?? fetchCoarseCandles(o.httpOptions))
    : o.fetchCandles;
  const warnings = approximate
    ? [`margin: gap > 24h since the last margin scan; evaluated with 4hour candles (approximate)`]
    : [];
  const candlesByPair = new Map<string, Candle[]>();
  for (const pair of pairs) {
    // 窓の頭に足が無いペアのため、直前の終値が取れるよう 1 区切りより前から取る
    const r = await fetch(pair, candleFromMs - (approximate ? ONE_DAY_MS : 60 * MIN_MS), o.nowMs);
    if (!r.success)
      return {
        kind: "failed",
        warnings: [...warnings, `margin: fetch candles for ${pair} failed: ${r.error}`],
      };
    candlesByPair.set(pair, r.data);
  }
  const params = await resolveMarginParams(pairs, {
    nowMs: o.nowMs,
    getPairs: o.getPairs ?? (() => getPairsWithCache({ httpOptions: o.httpOptions })),
    refreshPairs:
      o.getPairs ?? (() => getPairsWithCache({ refresh: true, httpOptions: o.httpOptions })),
    lastKnown: state.margin.lastParams,
  });
  if (!params.success) return { kind: "failed", warnings: [...warnings, params.error] };
  return {
    kind: "ready",
    input: {
      candlesByPair,
      params: params.data.params,
      candleFromMs,
      periodMs: period,
      approximate,
    },
    warnings: [...warnings, ...fallbackWarning(params.data.fallbacks)],
  };
}
