import { z } from "zod";
import { type HttpOptions, publicGet } from "../../http.js";
import { parseResponse } from "../../parse-response.js";
import { numStr } from "../../schema-helpers.js";
import type { Result } from "../../types.js";

const PairSchema = z.object({
  name: z.string(),
  base_asset: z.string(),
  quote_asset: z.string(),
  maker_fee_rate_base_quote: numStr,
  taker_fee_rate_base_quote: numStr,
  unit_amount: numStr,
  limit_max_amount: numStr,
  market_max_amount: numStr,
  price_digits: z.number().int().min(0).max(100),
  amount_digits: z.number().int().min(0).max(100),
  is_enabled: z.boolean(),
  stop_order: z.boolean(),
  stop_order_and_cancel: z.boolean(),
});

const PairsSchema = z.object({
  pairs: z.array(PairSchema),
});

export type Pair = z.infer<typeof PairSchema>;

export async function pairs(opts?: HttpOptions): Promise<Result<Pair[]>> {
  const result = await publicGet<unknown>("/v1/spot/pairs", opts);
  return parseResponse(result, PairsSchema, "pairs");
}
