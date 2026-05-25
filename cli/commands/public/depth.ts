import { z } from "zod";
import { type HttpOptions, publicGet } from "../../http.js";
import { parseResponse } from "../../parse-response.js";
import { numStr } from "../../schema-helpers.js";
import type { Result } from "../../types.js";
import { MSG_PAIR_DEPTH, validatePair } from "../../validators.js";

const DepthSchema = z.object({
  asks: z.array(z.tuple([numStr, numStr])),
  bids: z.array(z.tuple([numStr, numStr])),
  timestamp: z.number(),
});

export type Depth = z.infer<typeof DepthSchema>;

export async function depth(
  args: { pair: string | undefined },
  opts?: HttpOptions,
): Promise<Result<Depth>> {
  const v = validatePair(args.pair, MSG_PAIR_DEPTH);
  if (!v.success) return v;
  const result = await publicGet<unknown>(`/${v.data}/depth`, opts);
  return parseResponse(result, DepthSchema);
}
