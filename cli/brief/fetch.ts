// periodical-brief の取得層（ADR-008）。public のみ・1 銘柄あたり 4 リクエスト:
// 日足 = 今年 + 昨年の年間ファイル（SMA200 に約 300 本要る）、時足 = UTC 直近 2 日分
// （JST 当日は UTC 前日 15:00 から始まるので 2 ファイルで必ず覆える）。
// 年間ファイルは cli/commands/public/candles-fetch.ts のキャッシュに乗る（完了年のみ）。
import { type Candle, fetchOne } from "../commands/public/candles-fetch.js";
import { shiftDate, yearUtc, ymdUtc } from "../date-utils.js";
import type { HttpOptions } from "../http.js";
import type { Result } from "../types.js";

export type DailySeries = {
  candles: Candle[];
  /** 末尾の足が UTC 当日のもの（= まだ確定していない） */
  incomplete: boolean;
};

/** SMA200 + 余裕。年跨ぎ直後でも前年ファイルと合わせて足りる */
const DAILY_LIMIT = 300;
/** 時足は JST 当日の出来高集計にしか使わないので 2 日分（48 本）で十分 */
const HOURLY_LIMIT = 48;

function tail<T>(rows: T[], limit: number): T[] {
  return rows.length > limit ? rows.slice(rows.length - limit) : rows;
}

function sortByTs(rows: Candle[]): Candle[] {
  return [...rows].sort((a, b) => a.timestamp - b.timestamp);
}

export async function fetchDaily(
  pair: string,
  nowMs: number,
  opts?: HttpOptions,
  noCache?: boolean,
): Promise<Result<DailySeries>> {
  const thisYear = yearUtc(nowMs);
  const prevYear = shiftDate(thisYear, -1, "1day");
  const [prev, cur] = await Promise.all([
    fetchOne(pair, "1day", prevYear, opts, noCache),
    fetchOne(pair, "1day", thisYear, opts, noCache),
  ]);
  if (!prev.success) return prev;
  if (!cur.success) return cur;
  const candles = tail(sortByTs([...prev.data, ...cur.data]), DAILY_LIMIT);
  if (candles.length === 0) return { success: false, error: `${pair}: no daily candles` };
  const last = candles[candles.length - 1];
  return {
    success: true,
    data: { candles, incomplete: ymdUtc(last.timestamp) === ymdUtc(nowMs) },
  };
}

export async function fetchHourly(
  pair: string,
  nowMs: number,
  opts?: HttpOptions,
  noCache?: boolean,
): Promise<Result<Candle[]>> {
  const today = ymdUtc(nowMs);
  const yesterday = shiftDate(today, -1, "1hour");
  const [a, b] = await Promise.all([
    fetchOne(pair, "1hour", yesterday, opts, noCache),
    fetchOne(pair, "1hour", today, opts, noCache),
  ]);
  if (!a.success) return a;
  if (!b.success) return b;
  const candles = tail(sortByTs([...a.data, ...b.data]), HOURLY_LIMIT);
  if (candles.length === 0) return { success: false, error: `${pair}: no hourly candles` };
  return { success: true, data: candles };
}
