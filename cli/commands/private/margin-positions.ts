import { z } from "zod";
import { type PrivateHttpOptions, privateGet } from "../../http-private.js";
import { compactParams } from "../../params.js";
import { parseResponse } from "../../parse-response.js";
import { numStr } from "../../schema-helpers.js";
import type { Result } from "../../types.js";
import { validatePair } from "../../validators.js";

const PositionSchema = z.object({
  position_id: z.number(),
  pair: z.string(),
  side: z.string(),
  amount: numStr,
  price: numStr,
  open_pnl: numStr,
  close_pnl: numStr,
  margin_used: numStr,
  opened_at: z.number(),
});

const ResponseSchema = z.object({
  positions: z.array(PositionSchema),
});

export type MarginPosition = z.infer<typeof PositionSchema>;

export async function marginPositions(
  args: { pair?: string },
  opts?: PrivateHttpOptions,
): Promise<Result<MarginPosition[]>> {
  const { pair } = args;
  let normalizedPair = pair;
  if (pair !== undefined) {
    const pv = validatePair(pair);
    if (!pv.success) return pv;
    normalizedPair = pv.data;
  }
  const params = compactParams({ pair: normalizedPair });

  const result = await privateGet<unknown>("/user/margin/positions", params, opts);
  return parseResponse(result, ResponseSchema, "positions");
}
