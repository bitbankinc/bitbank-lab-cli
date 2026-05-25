import { z } from "zod";
import { type PrivateHttpOptions, privateGet } from "../../http-private.js";
import { parseResponse } from "../../parse-response.js";
import { nullableNumStr } from "../../schema-helpers.js";
import type { Result } from "../../types.js";

const MarginStatusSchema = z.object({
  margin_rate: nullableNumStr,
  todays_pnl: nullableNumStr,
  open_pnl: nullableNumStr,
  force_close_rate: nullableNumStr,
  total_assets_jpy: nullableNumStr,
  margin_used: nullableNumStr,
  margin_available: nullableNumStr,
});

export type MarginStatus = z.infer<typeof MarginStatusSchema>;

export async function marginStatus(opts?: PrivateHttpOptions): Promise<Result<MarginStatus>> {
  const result = await privateGet<unknown>("/user/margin/status", undefined, opts);
  return parseResponse(result, MarginStatusSchema);
}
