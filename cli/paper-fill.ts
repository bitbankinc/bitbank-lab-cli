// 100行超: paper の指値 fill 解決を 1 ファイルで完結。lastTickAt〜now の
// 1m 足を取得し、open orders を時系列で突き合わせて約定済みを history に
// 移す。テスト時は fetchCandles / nowMs を注入し、本番用デフォルトは
// public candles API を叩く。
import { type Candle, fetchOne } from "./commands/public/candles-fetch.js";
import { ymdJst } from "./date-utils.js";
import type { HttpOptions } from "./http.js";
import {
  DEFAULT_TAKER_FEE_RATE,
  type OpenOrder,
  type PaperHistoryEntry,
  type PaperState,
  defaultStatePath,
  loadState,
  saveState,
} from "./paper-state.js";
import type { Result } from "./types.js";

const ONE_MIN_MS = 60_000;
const MAX_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export type FetchCandles = (
  pair: string,
  fromMs: number,
  toMs: number,
) => Promise<Result<Candle[]>>;

export type TickOptions = {
  statePath?: string;
  pair?: string;
  fetchCandles?: FetchCandles;
  nowMs?: number;
  feeRate?: number;
  httpOptions?: HttpOptions;
};

export type TickResult = {
  filled: PaperHistoryEntry[];
  warnings: string[];
  lastTickAt: string;
};

export async function runTick(opts: TickOptions = {}): Promise<Result<TickResult>> {
  const path = opts.statePath ?? defaultStatePath();
  const sr = await loadState(path);
  if (!sr.success) return sr;
  const nowMs = opts.nowMs ?? Date.now();
  const newLastTickAt = new Date(nowMs).toISOString();
  if (!sr.data)
    return { success: true, data: { filled: [], warnings: [], lastTickAt: newLastTickAt } };
  if (sr.data.openOrders.length === 0) {
    const updated: PaperState = { ...sr.data, lastTickAt: newLastTickAt };
    const w = await saveState(updated, path);
    if (!w.success) return w;
    return { success: true, data: { filled: [], warnings: [], lastTickAt: newLastTickAt } };
  }
  const lastTickMs = Date.parse(sr.data.lastTickAt);
  let fromMs = Math.min(lastTickMs, nowMs);
  const warnings: string[] = [];
  if (nowMs - fromMs > MAX_LOOKBACK_MS) {
    warnings.push(`gap > 24h; limiting to last 24h (lastTickAt=${sr.data.lastTickAt})`);
    fromMs = nowMs - MAX_LOOKBACK_MS;
  }
  const fetchFn = opts.fetchCandles ?? defaultFetchCandles(opts.httpOptions);
  const feeRate = opts.feeRate ?? DEFAULT_TAKER_FEE_RATE;
  const pairs = uniquePairs(sr.data.openOrders, opts.pair);
  let working: PaperState = sr.data;
  const filled: PaperHistoryEntry[] = [];
  let anyFetchFailed = false;
  for (const p of pairs) {
    const cr = await fetchFn(p, fromMs, nowMs);
    if (!cr.success) {
      anyFetchFailed = true;
      warnings.push(`fetch candles for ${p} failed: ${cr.error}`);
      continue;
    }
    const sorted = [...cr.data].sort((a, b) => a.timestamp - b.timestamp);
    for (const candle of sorted) {
      if (candle.timestamp < fromMs || candle.timestamp > nowMs) continue;
      const orders = working.openOrders.filter(
        (o) => o.pair === p && Date.parse(o.createdAt) <= candle.timestamp,
      );
      for (const o of orders) {
        const hits = o.side === "buy" ? candle.low <= o.price : candle.high >= o.price;
        if (!hits) continue;
        const r = applyFill(working, o, candle, feeRate);
        working = r.state;
        filled.push(r.entry);
      }
    }
  }
  // 部分 tick（pair 限定 or fetch 失敗）では lastTickAt を進めない。
  // 進めると未処理 pair / 未処理区間が永久に評価されなくなる。
  const advanceTick = !anyFetchFailed && opts.pair === undefined;
  const persistedLastTickAt = advanceTick ? newLastTickAt : working.lastTickAt;
  working = { ...working, lastTickAt: persistedLastTickAt, updatedAt: newLastTickAt };
  const w = await saveState(working, path);
  if (!w.success) return w;
  for (const msg of warnings) process.stderr.write(`Warning: ${msg}\n`);
  return { success: true, data: { filled, warnings, lastTickAt: persistedLastTickAt } };
}

function uniquePairs(orders: OpenOrder[], filter?: string): string[] {
  const set = new Set<string>();
  for (const o of orders) {
    if (filter && o.pair !== filter) continue;
    set.add(o.pair);
  }
  return [...set];
}

function applyFill(
  state: PaperState,
  o: OpenOrder,
  candle: Candle,
  feeRate: number,
): { state: PaperState; entry: PaperHistoryEntry } {
  const [base, quote] = o.pair.split("_");
  const balances = { ...state.balances };
  const notional = o.price * o.amount;
  const rawFee = notional * feeRate;
  const isJpy = quote === "jpy";
  const feeQuote = isJpy ? Math.round(rawFee) : rawFee;
  if (o.side === "buy") {
    const cost = isJpy ? Math.round(notional + rawFee) : notional + rawFee;
    balances[quote] = (balances[quote] ?? 0) - cost;
    balances[base] = (balances[base] ?? 0) + o.amount;
  } else {
    const proceeds = isJpy ? Math.round(notional - rawFee) : notional - rawFee;
    balances[base] = (balances[base] ?? 0) - o.amount;
    balances[quote] = (balances[quote] ?? 0) + proceeds;
  }
  const filledAt = new Date(candle.timestamp + ONE_MIN_MS).toISOString();
  const entry: PaperHistoryEntry = {
    id: o.id,
    pair: o.pair,
    side: o.side,
    type: "limit",
    amount: o.amount,
    fillPrice: o.price,
    feeQuote,
    filledAt,
  };
  const newState: PaperState = {
    ...state,
    balances,
    history: [...state.history, entry],
    openOrders: state.openOrders.filter((x) => x.id !== o.id),
  };
  return { state: newState, entry };
}

function defaultFetchCandles(httpOpts?: HttpOptions): FetchCandles {
  return async (pair, fromMs, toMs) => {
    // bitbank の 1min candle は JST 基準の YYYYMMDD で配信されるため
    // ホスト TZ ではなく JST で日付セグメントを組み立てる。
    const dates = new Set<string>([ymdJst(fromMs), ymdJst(toMs)]);
    const all: Candle[] = [];
    for (const d of [...dates].sort()) {
      const r = await fetchOne(pair, "1min", d, httpOpts, true);
      if (!r.success) return r;
      for (const c of r.data) {
        if (c.timestamp >= fromMs && c.timestamp <= toMs) all.push(c);
      }
    }
    return { success: true, data: all };
  };
}
