// periodical-brief の 1 銘柄分の計算（ADR-008）。**指標は確定足のみ**で計算する
// （当日足を含めると時刻によって値がブレる）。当日足は現在値・始値比の表示にだけ使う。
import type { Candle } from "../commands/public/candles-fetch.js";
import type { DailySeries } from "./fetch.js";
import { atr, macdHist, rsi, sma } from "./indicators.js";
import { jstParts } from "./jst.js";
import { renderPair } from "./render.js";
import type { PairBrief } from "./schema.js";
import { volumeProfile } from "./volume.js";

export const RSI_PERIOD = 14;
export const ATR_PERIOD = 14;
export const SMA_PERIODS = [20, 50, 200] as const;

function pct(from: number, to: number): number {
  return from === 0 ? 0 : ((to - from) / from) * 100;
}

function trendOf(
  price: number,
  smas: (number | null)[],
): { trend: PairBrief["trend"]; position: string[] } {
  const position: string[] = [];
  let below = 0;
  smas.forEach((s, i) => {
    if (s === null) return;
    const isBelow = price < s;
    if (isBelow) below++;
    position.push(`${isBelow ? "<" : ">"}S${SMA_PERIODS[i]}`);
  });
  // SMA が 1 本も揃わない（確定足 20 本未満）ときは判定不能なので MIX に倒す
  const trend = position.length === 0 ? "MIX" : below >= 2 ? "DOWN" : below === 0 ? "UP" : "MIX";
  return { trend, position };
}

export function computePairBrief(
  pair: string,
  daily: DailySeries,
  hourly: Candle[],
  nowMs: number,
): PairBrief {
  const { candles, incomplete } = daily;
  const latest = candles[candles.length - 1];
  const confirmed = incomplete ? candles.slice(0, -1) : candles;
  const closes = confirmed.map((c) => c.close);
  const price = latest.close;
  const smas = SMA_PERIODS.map((n) => sma(closes, n));
  const { trend, position } = trendOf(price, smas);
  const hist = macdHist(closes);
  const last = confirmed.length > 0 ? confirmed[confirmed.length - 1] : null;
  const lastJst = last ? jstParts(last.timestamp) : null;
  const body: Omit<PairBrief, "lines"> = {
    pair,
    price,
    intraday_pct: pct(latest.open, latest.close),
    daily_incomplete: incomplete,
    rsi14: rsi(closes, RSI_PERIOD),
    macd_hist: hist,
    macd_sign: hist === null ? null : hist > 0 ? "+" : "-",
    sma20: smas[0],
    sma50: smas[1],
    sma200: smas[2],
    trend,
    position,
    volume: volumeProfile(confirmed, hourly, nowMs),
    last_confirmed:
      last && lastJst
        ? {
            date: lastJst.date,
            weekday: lastJst.weekday,
            open: last.open,
            close: last.close,
            change_pct: pct(last.open, last.close),
          }
        : null,
    atr14: atr(confirmed, ATR_PERIOD),
  };
  return { ...body, lines: renderPair(body) };
}
