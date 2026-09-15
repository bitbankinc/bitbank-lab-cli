// periodical-brief の出来高プロファイル（ADR-008）。直近 30 本の確定日足を JST の曜日で分け、
// 平日・土・日の 1 日平均を出す（週末の薄商いを一目で見るため）。「本日」は時足を JST 当日で
// 絞った合計で、未確定の途中経過。
import type { Candle } from "../commands/public/candles-fetch.js";
import { isSaturday, isSunday, isWeekday, jstParts } from "./jst.js";
import type { VolumeProfile } from "./schema.js";

/** 曜日別出来高の標本本数（確定日足） */
export const VOLUME_SAMPLE_DAYS = 30;

function avg(xs: number[]): number | null {
  return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function volumeProfile(confirmed: Candle[], hourly: Candle[], nowMs: number): VolumeProfile {
  const sample = confirmed.slice(-VOLUME_SAMPLE_DAYS);
  const byDay = sample.map((c) => ({ w: jstParts(c.timestamp).weekdayIndex, vol: c.vol }));
  const pick = (f: (i: number) => boolean) => avg(byDay.filter((d) => f(d.w)).map((d) => d.vol));
  const weekday = pick(isWeekday);
  const sat = pick(isSaturday);
  const todayJst = jstParts(nowMs).date;
  const today = hourly.filter((h) => jstParts(h.timestamp).date === todayJst);
  return {
    today_jst: today.reduce((a, h) => a + h.vol, 0),
    weekday_avg: weekday,
    sat_avg: sat,
    sun_avg: pick(isSunday),
    sat_vs_weekday_pct:
      weekday !== null && weekday !== 0 && sat !== null ? (sat / weekday) * 100 : null,
    avg_30d: avg(byDay.map((d) => d.vol)) ?? 0,
    sample_days: sample.length,
  };
}
