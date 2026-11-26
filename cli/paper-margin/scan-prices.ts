// scan.ts が各時刻で使う価格（ADR-010 / docs/dev/paper-margin-plan.md §3.5）。純関数。
// - その時刻ちょうどの足があれば、その安値・高値（強制決済の判定は losscut.ts が不利な方を選ぶ）
// - 足の途中の時刻（4hour 足での JST 15 時など）は、その足の安値・高値。足の終値はその時刻より後の価格なので使わない。
//   安値・高値も時刻より後の分を含むが、不利な極値で判定する側（強制決済・追証が早く起きる側）に倒れる
// - 足が終わった後で次の足が無ければ（約定の無い分）、直前の足の終値
// - 直前の足も無ければ、最初の足の始値（窓の頭でまだ足が出ていないペア。わずかに先の値を使う近似）
// 建玉か注文のあるペアに足が 1 本も無ければ失敗する。黙って判定を飛ばすと強制決済を見逃すため。
import type { Candle } from "../commands/public/candles-fetch.js";
import type { Result } from "../types.js";
import type { PriceRange } from "./losscut.js";

export type PriceTrack = {
  /** [fromMs, toMs] にある足の時刻（重複なし・昇順） */
  candleTimes: number[];
  candleAt(pair: string, t: number): Candle | undefined;
  rangeAt(pair: string, t: number): PriceRange;
};

export function buildPriceTrack(
  candlesByPair: ReadonlyMap<string, readonly Candle[]>,
  pairs: ReadonlySet<string>,
  fromMs: number,
  toMs: number,
  periodMs: number,
): Result<PriceTrack> {
  const sorted = new Map<string, Candle[]>();
  const times = new Set<number>();
  for (const pair of pairs) {
    const cs = [...(candlesByPair.get(pair) ?? [])]
      .filter((c) => c.timestamp <= toMs)
      .sort((a, b) => a.timestamp - b.timestamp);
    if (cs.length === 0) return { success: false, error: `margin scan: no candles for ${pair}` };
    sorted.set(pair, cs);
    for (const c of cs) if (c.timestamp >= fromMs) times.add(c.timestamp);
  }
  const candleAt = (pair: string, t: number) => sorted.get(pair)?.find((c) => c.timestamp === t);
  const rangeAt = (pair: string, t: number): PriceRange => {
    const cs = sorted.get(pair) as Candle[];
    const at = cs.find((c) => c.timestamp === t);
    if (at) return { low: at.low, high: at.high };
    const before = cs.filter((c) => c.timestamp < t).at(-1);
    if (before && t < before.timestamp + periodMs) return { low: before.low, high: before.high };
    const px = before ? before.close : cs[0].open;
    return { low: px, high: px };
  };
  return {
    success: true,
    data: { candleTimes: [...times].sort((a, b) => a - b), candleAt, rangeAt },
  };
}
