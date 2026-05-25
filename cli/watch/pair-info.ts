import { type CachedPair, getPairsWithCache } from "../pairs-cache.js";
import type { Result } from "../types.js";
import type { PairInfo } from "./format.js";

export type GetPairs = () => Promise<Result<CachedPair[]>>;

export async function resolvePairInfo(
  pair: string,
  getPairs: GetPairs = () => getPairsWithCache(),
): Promise<PairInfo | undefined> {
  const r = await getPairs();
  if (!r.success) return undefined;
  const found = r.data.find((p) => p.name === pair);
  if (!found) return undefined;
  return { priceDecimals: found.price_digits, amountDecimals: found.amount_digits };
}
