// periodical-brief の 3 行テキスト整形（ADR-008）。参考実装（issue #21）の書式を踏襲する:
//   ## btc_jpy  px=9,919,488 (+0.2% intraday)  RSI36 MACD- trend:DOWN[<S20 <S50 <S200]  ※日足未確定
//      vol today(JST,so far)=42.1 | wk=117 sat=49(42%) sun=54 30d=97
//      Sat 08-01(確定): 9,920,000->9,897,393 (-0.2%)  ATR14=275,862
// 数値の丸めはここ（表示境界）だけで行い、構造化データ側は丸めない。
import { jstParts } from "./jst.js";
import type { PairBrief } from "./schema.js";

function withCommas(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 桁数を価格水準で切り替える（xrp_jpy の 300 円台や dai_jpy を 0 桁で潰さない） */
export function fmtPrice(v: number | null): string {
  if (v === null) return "n/a";
  const abs = Math.abs(v);
  const decimals = abs >= 1000 ? 0 : abs >= 10 ? 2 : 4;
  return fmtFixed(v, decimals);
}

export function fmtFixed(v: number, decimals: number): string {
  const s = Math.abs(v).toFixed(decimals);
  const [int, frac] = s.split(".");
  const body = frac === undefined ? withCommas(int) : `${withCommas(int)}.${frac}`;
  return v < 0 ? `-${body}` : body;
}

export function fmtVol(v: number | null): string {
  return v === null ? "n/a" : fmtFixed(v, 1);
}

export function fmtPct(v: number | null): string {
  if (v === null) return "n/a";
  const s = v.toFixed(1);
  return v > 0 ? `+${s}%` : `${s}%`;
}

export type PairLines = PairBrief["lines"];

export function renderPair(b: Omit<PairBrief, "lines">): PairLines {
  const rsi = b.rsi14 === null ? "n/a" : String(Math.round(b.rsi14));
  const macd = b.macd_sign ?? "n/a";
  const note = b.daily_incomplete ? "  ※日足未確定" : "";
  const line1 =
    `## ${b.pair}  px=${fmtPrice(b.price)} (${fmtPct(b.intraday_pct)} intraday)  ` +
    `RSI${rsi} MACD${macd} trend:${b.trend}[${b.position.join(" ")}]${note}`;
  const v = b.volume;
  const satPct = v.sat_vs_weekday_pct === null ? "n/a" : `${Math.round(v.sat_vs_weekday_pct)}%`;
  const line2 =
    `   vol today(JST,so far)=${fmtVol(v.today_jst)} | wk=${fmtVol(v.weekday_avg)} ` +
    `sat=${fmtVol(v.sat_avg)}(${satPct}) sun=${fmtVol(v.sun_avg)} 30d=${fmtVol(v.avg_30d)}`;
  const lc = b.last_confirmed;
  const line3 = lc
    ? `   ${lc.weekday} ${lc.date.slice(5)}(確定): ${fmtPrice(lc.open)}->${fmtPrice(lc.close)} ` +
      `(${fmtPct(lc.change_pct)})  ATR14=${fmtPrice(b.atr14)}`
    : `   (確定足なし)  ATR14=${fmtPrice(b.atr14)}`;
  return [line1, line2, line3];
}

export function renderHeader(nowMs: number, pairCount: number): string {
  const j = jstParts(nowMs);
  return `# bitbank periodical brief ${j.date} ${j.weekday} JST ${j.time}  (${pairCount} pairs)`;
}

export function asOfJst(nowMs: number): string {
  const j = jstParts(nowMs);
  return `${j.date} ${j.weekday} ${j.time} JST`;
}
