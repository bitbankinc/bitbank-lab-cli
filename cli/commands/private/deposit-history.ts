import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import { type PrivateHttpOptions, privateGet } from "../../http-private.js";
import { compactParams } from "../../params.js";
import { parseResponse } from "../../parse-response.js";
import { numStr } from "../../schema-helpers.js";
import type { Result } from "../../types.js";
import { AssetSchema } from "../../validators.js";
import { CountSchema, TimestampMsSchema, formatZodError, refineSinceEnd } from "./input-schemas.js";

const DepositSchema = z.object({
  uuid: z.string(),
  asset: z.string(),
  amount: numStr,
  txid: z.string().nullable(),
  status: z.string(),
  found_at: z.number(),
  confirmed_at: z.number().nullable(),
});

const DepositHistoryResponseSchema = z.object({
  deposits: z.array(DepositSchema),
});

const RequestSchema = z
  .object({
    asset: AssetSchema.optional(),
    count: CountSchema.optional(),
    since: TimestampMsSchema.optional(),
    end: TimestampMsSchema.optional(),
  })
  .superRefine(refineSinceEnd);

export type Deposit = z.infer<typeof DepositSchema>;
export type DepositHistoryArgs = z.infer<typeof RequestSchema>;

export async function depositHistory(
  args: DepositHistoryArgs,
  opts?: PrivateHttpOptions,
): Promise<Result<Deposit[]>> {
  const parsed = RequestSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: formatZodError(parsed.error), exitCode: EXIT.PARAM };
  }
  const params = compactParams({
    asset: parsed.data.asset,
    count: parsed.data.count,
    since: parsed.data.since,
    end: parsed.data.end,
  });
  const result = await privateGet<unknown>("/user/deposit_history", params, opts);
  return parseResponse(result, DepositHistoryResponseSchema, "deposits");
}
