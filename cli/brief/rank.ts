// `--top N` / `--all` の母集団。tickers（24h 出来高 × 現在値 = JPY 建て売買代金）で並べ、
// **現行の取扱い銘柄（cli/pairs.ts の KNOWN_PAIRS）に絞る**。tickers API には旧ティッカー
// （matic_jpy / rndr_jpy / mkr_jpy）や BTC 建てクロスペアも載るが、取扱い銘柄ではない
// （issue #21 のレビュー指摘）。除外リストを別に持たず、補完と同じ静的一覧を単一ソースにする。
import { tickers } from "../commands/public/tickers.js";
import type { HttpOptions } from "../http.js";
import { KNOWN_PAIRS } from "../pairs.js";
import type { Result } from "../types.js";

const TRADABLE = new Set(KNOWN_PAIRS);

/** 取扱い JPY 建て銘柄を 24h 売買代金の降順で返す */
export async function rankedPairs(opts?: HttpOptions): Promise<Result<string[]>> {
  const r = await tickers(opts);
  if (!r.success) return r;
  const scored: { pair: string; turnover: number }[] = [];
  for (const t of r.data) {
    if (!TRADABLE.has(t.pair)) continue;
    if (t.vol === null || t.last === null) continue;
    scored.push({ pair: t.pair, turnover: t.vol * t.last });
  }
  scored.sort((a, b) => b.turnover - a.turnover);
  return { success: true, data: scored.map((s) => s.pair) };
}
