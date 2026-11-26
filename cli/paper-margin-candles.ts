// paper の信用の走査で、前回 tick から 24h を超えた区間を見るための 4hour 足の取得
// （ADR-010 決定 4 / docs/dev/paper-margin-plan.md §3.5）。4hour 足は年単位ファイル（UTC の年）で配信されるので、
// 窓にかかる年のファイルを順に取り、窓の中の足だけを返す。今年のファイルは未確定なのでキャッシュしない。
import { type Candle, fetchOne } from "./commands/public/candles-fetch.js";
import { yearUtc } from "./date-utils.js";
import type { HttpOptions } from "./http.js";
import type { Result } from "./types.js";

export function fetchCoarseCandles(
  httpOptions?: HttpOptions,
): (pair: string, fromMs: number, toMs: number) => Promise<Result<Candle[]>> {
  return async (pair, fromMs, toMs) => {
    const out: Candle[] = [];
    for (let y = Number(yearUtc(fromMs)); y <= Number(yearUtc(toMs)); y++) {
      const r = await fetchOne(pair, "4hour", String(y), httpOptions, true);
      if (!r.success) return r;
      out.push(...r.data.filter((c) => c.timestamp >= fromMs && c.timestamp <= toMs));
    }
    return { success: true, data: out };
  };
}
