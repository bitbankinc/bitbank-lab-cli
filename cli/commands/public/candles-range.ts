import { shiftDate } from "../../date-utils.js";
import type { HttpOptions } from "../../http.js";
import type { Result } from "../../types.js";
import { type Candle, fetchOne } from "./candles-fetch.js";

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

function mergeBatchResults(
  results: Result<Candle[]>[],
  allRows: Candle[],
): { cont: true } | { cont: false; result: Result<Candle[]> } {
  for (const result of results) {
    if (!result.success) {
      if (allRows.length === 0) return { cont: false, result };
      return { cont: false, result: { success: true, data: allRows, partial: true } };
    }
    allRows.push(...result.data);
  }
  return { cont: true };
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

  for (let i = 0; i < dates.length; i += BATCH_SIZE) {
    const batch = dates.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((d) => fetchOne(pair, type, d, opts, noCache)));
    const merged = mergeBatchResults(results, allRows);
    if (!merged.cont) return merged.result;
  }

  if (truncated) {
    return {
      success: true,
      data: allRows,
      partial: true,
      meta: { truncated: true, truncatedAt, reason: "MAX_RANGE_FETCHES" },
    };
  }
  return { success: true, data: allRows };
}
