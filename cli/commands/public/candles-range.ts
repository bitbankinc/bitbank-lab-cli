import { shiftDate } from "../../date-utils.js";
import type { HttpOptions } from "../../http.js";
import type { Result, ResultMeta } from "../../types.js";
import { type Candle, fetchOne } from "./candles-fetch.js";
import {
  augmentMeta,
  detectGaps,
  detectLastIncomplete,
  normalizeCandles,
} from "./candles-merge.js";

// 1年分+1日。年をまたぐレンジでも全日取得可能にする上限
const MAX_RANGE_FETCHES = 366;
// 並列フェッチ数。API レート制限を考慮した経験値
const BATCH_SIZE = 10;

function buildDateList(
  from: string,
  to: string,
  type: string,
): { dates: string[]; truncated: boolean; truncatedAt?: string } {
  const dates: string[] = [];
  let current = from;
  while (current <= to && dates.length < MAX_RANGE_FETCHES) {
    dates.push(current);
    current = shiftDate(current, 1, type);
  }
  const truncated = current <= to;
  return { dates, truncated, truncatedAt: truncated ? current : undefined };
}

export async function candlesRange(
  pair: string,
  type: string,
  from: string,
  to: string,
  opts?: HttpOptions,
  noCache?: boolean,
): Promise<Result<Candle[]>> {
  const { dates, truncated, truncatedAt } = buildDateList(from, to, type);
  const allRows: Candle[] = [];
  let partial = false;

  outer: for (let i = 0; i < dates.length; i += BATCH_SIZE) {
    const batch = dates.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((d) => fetchOne(pair, type, d, opts, noCache)));
    for (const result of results) {
      if (!result.success) {
        if (allRows.length === 0) return result;
        partial = true;
        break outer;
      }
      allRows.push(...result.data);
    }
  }

  const { rows: normalized, dedupedCount } = normalizeCandles(allRows);
  const gaps = detectGaps(normalized, type);
  const baseMeta: ResultMeta | undefined = truncated
    ? { truncated: true, truncatedAt, reason: "MAX_RANGE_FETCHES" }
    : undefined;
  const incomplete = detectLastIncomplete(normalized, type);
  const meta = augmentMeta(dedupedCount, gaps, baseMeta, incomplete);
  const isPartial = partial || truncated;

  if (isPartial && meta) return { success: true, data: normalized, partial: true, meta };
  if (isPartial) return { success: true, data: normalized, partial: true };
  if (meta) return { success: true, data: normalized, meta };
  return { success: true, data: normalized };
}
