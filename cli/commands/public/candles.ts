// 100行超: pair/type/date/range の入力検証 + 単発取得・自動マージ・範囲取得のディスパッチを 1 ファイルに集約
import { YEARLY_TYPES, rowsPerSegment, shiftDate, todayDate } from "../../date-utils.js";
import { validateDateFormat } from "../../date-validators.js";
import type { HttpOptions } from "../../http.js";
import type { Result } from "../../types.js";
import { validatePair } from "../../validators.js";
import { type Candle, VALID_TYPES, fetchOne } from "./candles-fetch.js";
import { augmentMeta, detectGaps, normalizeCandles } from "./candles-merge.js";
import { candlesRange } from "./candles-range.js";

export type { Candle };
export { VALID_TYPES } from "./candles-fetch.js";
export { shiftDate } from "../../date-utils.js";

const BATCH_SIZE = 10; // candles-range と同じ並列数（throttle.ts の lowWaterMark 配慮）
const HARD_MAX_SEGMENTS = 100; // --limit が極端に大きい場合の暴走防止
function validateType(type: string | undefined): string | null {
  if (!type || !VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) return null;
  return type;
}

type CandlesArgs = {
  pair: string | undefined;
  type: string | undefined;
  date?: string;
  limit?: number;
  from?: string;
  to?: string;
  noCache?: boolean;
};

function olderDates(dateStr: string, type: string, count: number): string[] {
  const dates: string[] = [];
  let d = dateStr;
  for (let i = 0; i < count; i++) {
    d = shiftDate(d, -1, type);
    dates.push(d);
  }
  return dates;
}

async function fetchAutoMerge(
  pair: string,
  type: string,
  dateStr: string,
  limit: number,
  firstData: Candle[],
  opts?: HttpOptions,
  noCache?: boolean,
): Promise<Result<Candle[]>> {
  const year = YEARLY_TYPES.has(type) ? Number(dateStr) : undefined;
  const perSegment = rowsPerSegment(type, year) || Math.max(firstData.length, 1);
  const remaining = Math.max(0, limit - firstData.length);
  const idealNeeded = Math.ceil(remaining / perSegment);
  const needed = Math.min(idealNeeded, HARD_MAX_SEGMENTS);
  if (needed === 0) return { success: true, data: firstData.slice(-limit) };
  const dates = olderDates(dateStr, type, needed);
  const olderChunks: Candle[][] = new Array(dates.length);
  let hadFetchFailure = false;
  for (let i = 0; i < dates.length; i += BATCH_SIZE) {
    const batch = dates.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((d) => fetchOne(pair, type, d, opts, noCache)));
    let stop = false;
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (!r.success) {
        hadFetchFailure = true;
        stop = true;
        break;
      }
      olderChunks[i + j] = r.data;
    }
    if (stop) break;
  }
  const ordered = olderChunks.filter(Boolean).reverse();
  const allRows = ([] as Candle[]).concat(...ordered, firstData);
  const { rows: normalized, dedupedCount } = normalizeCandles(allRows);
  const data = normalized.slice(-limit);
  const gaps = detectGaps(data, type);
  if (idealNeeded > HARD_MAX_SEGMENTS && !hadFetchFailure) {
    return {
      success: true,
      data,
      partial: true,
      meta: augmentMeta(dedupedCount, gaps, {
        truncated: true,
        requestedLimit: limit,
        returnedRows: data.length,
        reason: "HARD_MAX_SEGMENTS",
      }),
    };
  }
  const meta = augmentMeta(dedupedCount, gaps);
  if (hadFetchFailure) {
    return meta
      ? { success: true, data, partial: true, meta }
      : { success: true, data, partial: true };
  }
  return meta ? { success: true, data, meta } : { success: true, data };
}

export async function candles(args: CandlesArgs, opts?: HttpOptions): Promise<Result<Candle[]>> {
  const pv = validatePair(args.pair);
  if (!pv.success) return pv;
  const pair = pv.data;
  const { type, date, limit, from, to, noCache } = args;
  const validType = validateType(type);
  if (!validType) {
    return { success: false, error: `--type is required. Valid: ${VALID_TYPES.join(", ")}` };
  }

  if ((from || to) && date) {
    return { success: false, error: "--date and --from/--to cannot be used together" };
  }
  if ((from && !to) || (!from && to)) {
    return { success: false, error: "--from and --to must both be specified" };
  }

  if (from && to) {
    const fv = validateDateFormat(from, validType, "--from");
    if (!fv.success) return fv;
    const tov = validateDateFormat(to, validType, "--to");
    if (!tov.success) return tov;
    if (from > to) return { success: false, error: "--from must be before or equal to --to" };
    return candlesRange(pair, validType, from, to, opts, noCache);
  }

  const dateStr = date ?? todayDate(validType);
  if (date) {
    const dv = validateDateFormat(date, validType, "--date");
    if (!dv.success) return dv;
  }

  const first = await fetchOne(pair, validType, dateStr, opts, noCache);
  if (!first.success) return first;
  if (date !== undefined) {
    return { success: true, data: limit === undefined ? first.data : first.data.slice(-limit) };
  }
  const effectiveLimit = limit ?? 1000;
  return fetchAutoMerge(pair, validType, dateStr, effectiveLimit, first.data, opts, noCache);
}
