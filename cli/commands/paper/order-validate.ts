import type { CachedPair } from "../../pairs-cache.js";
import type { Result } from "../../types.js";

export function validateOrderSize(
  pair: string,
  type: "market" | "limit",
  amount: number,
  pairs: CachedPair[],
): Result<{ ok: true }> {
  const info = pairs.find((p) => p.name === pair);
  if (!info) return { success: false, error: `unknown pair: ${pair}` };
  if (amount < info.unit_amount) {
    return {
      success: false,
      error: `amount < unit_amount: ${pair} requires >= ${info.unit_amount}`,
    };
  }
  const max = type === "limit" ? info.limit_max_amount : info.market_max_amount;
  if (amount > max) {
    return {
      success: false,
      error: `amount > ${type}_max_amount: ${pair} max ${max}`,
    };
  }
  return { success: true, data: { ok: true } };
}
