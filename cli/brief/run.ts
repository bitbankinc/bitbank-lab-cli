// periodical-brief のパイプライン（ADR-008）: 銘柄ごとに「日足 + 時足を取得 → 計算 → 3 行」を
// 同時数ガード付きで回し、ヘッダと連結する。失敗した銘柄は落とさず errors に積み、
// 1 件でもあれば Result.partial を立てる（全滅のときだけ失敗を返す）。
import { sanitizeErrorMessage } from "../error-sanitize.js";
import type { HttpOptions } from "../http.js";
import type { Result } from "../types.js";
import { computePairBrief } from "./compute.js";
import { mapWithConcurrency } from "./concurrency.js";
import { fetchDaily, fetchHourly } from "./fetch.js";
import { asOfJst, renderHeader } from "./render.js";
import type { Brief, PairBrief } from "./schema.js";

export type RunArgs = {
  pairs: string[];
  nowMs: number;
  concurrency: number;
  noCache: boolean;
};

export const BRIEF_NOTE =
  "指標（RSI14 / MACD 12-26-9 / SMA20-50-200 / ATR14）は確定日足のみで計算し、当日足は現在値と" +
  "始値比の表示にだけ使う。出来高の曜日別平均は直近 30 本の確定日足を JST の曜日で分けた平均。" +
  "本コマンドは数値と前提だけを返し、売買判断は出さない。";

type PairOutcome = { ok: true; brief: PairBrief } | { ok: false; pair: string; error: string };

async function onePair(pair: string, args: RunArgs, opts?: HttpOptions): Promise<PairOutcome> {
  // 取得層は Result を返すが、candle キャッシュの書き込み（cli/cache.ts の mkdirSync 等）は
  // FS 障害で例外になり得る。1 銘柄の例外で全体を巻き込まず、銘柄単位の失敗に変換する。
  try {
    const [daily, hourly] = await Promise.all([
      fetchDaily(pair, args.nowMs, opts, args.noCache),
      fetchHourly(pair, args.nowMs, opts, args.noCache),
    ]);
    if (!daily.success) return { ok: false, pair, error: daily.error };
    if (!hourly.success) return { ok: false, pair, error: hourly.error };
    return { ok: true, brief: computePairBrief(pair, daily.data, hourly.data, args.nowMs) };
  } catch (e) {
    return { ok: false, pair, error: sanitizeErrorMessage(e) };
  }
}

export async function runBrief(args: RunArgs, opts?: HttpOptions): Promise<Result<Brief>> {
  const outcomes = await mapWithConcurrency(args.pairs, args.concurrency, (p) =>
    onePair(p, args, opts),
  );
  const pairs: PairBrief[] = [];
  const errors: Brief["errors"] = [];
  for (const o of outcomes) {
    if (o.ok) pairs.push(o.brief);
    else errors.push({ pair: o.pair, error: o.error });
  }
  if (pairs.length === 0 && errors.length > 0) {
    return { success: false, error: errors.map((e) => `${e.pair}: ${e.error}`).join("; ") };
  }
  const lines = [renderHeader(args.nowMs, args.pairs.length)];
  for (const o of outcomes) {
    if (o.ok) lines.push(...o.brief.lines);
    else lines.push(`## ${o.pair}  ERROR: ${o.error}`);
  }
  const data: Brief = {
    as_of: new Date(args.nowMs).toISOString(),
    as_of_jst: asOfJst(args.nowMs),
    pairs,
    errors,
    text: lines.join("\n"),
    note: BRIEF_NOTE,
  };
  return errors.length > 0 ? { success: true, data, partial: true } : { success: true, data };
}
