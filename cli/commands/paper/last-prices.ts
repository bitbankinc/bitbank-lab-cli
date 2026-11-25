// paper の信用の口座評価と成行の約定に使う現在値（ticker の last）を取る。public の ticker だけを叩く。
// create-margin-order・margin-status / margin-positions・現物の成行の売りでの追証の解消判定（spot-sale-margin.ts）が使う。
import type { HttpOptions } from "../../http.js";
import type { Result } from "../../types.js";
import { ticker } from "../public/ticker.js";

/** 口座評価と成行の約定に使う現在値（ticker の last） */
export async function fetchLastPrices(
  pairs: readonly string[],
  opts?: HttpOptions,
): Promise<Result<Map<string, number>>> {
  const out = new Map<string, number>();
  for (const pair of pairs) {
    const t = await ticker({ pair }, opts);
    if (!t.success) return t;
    const last = Number(t.data.last);
    if (!t.data.last || !Number.isFinite(last) || last <= 0) {
      return { success: false, error: `ticker for ${pair} has no positive last price` };
    }
    out.set(pair, last);
  }
  return { success: true, data: out };
}
