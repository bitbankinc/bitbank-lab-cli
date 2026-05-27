import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import { type PrivateHttpOptions, privateGet } from "../../http-private.js";
import { compactParams } from "../../params.js";
import { parseResponse } from "../../parse-response.js";
import { numStr } from "../../schema-helpers.js";
import type { Result } from "../../types.js";
import { AssetSchema } from "../../validators.js";
import { CountSchema, TimestampMsSchema, formatZodError, refineSinceEnd } from "./input-schemas.js";

const WithdrawalSchema = z.object({
  uuid: z.string(),
  asset: z.string(),
  amount: numStr,
  fee: numStr,
  label: z.string().nullable(),
  address: z.string(),
  txid: z.string().nullable(),
  status: z.string(),
  requested_at: z.number(),
});

const ResponseSchema = z.object({
  withdrawals: z.array(WithdrawalSchema),
});

const RequestSchema = z
  .object({
    asset: AssetSchema,
    count: CountSchema.optional(),
    since: TimestampMsSchema.optional(),
    end: TimestampMsSchema.optional(),
  })
  .superRefine(refineSinceEnd);

export type Withdrawal = z.infer<typeof WithdrawalSchema>;
export type WithdrawalHistoryArgs = z.infer<typeof RequestSchema>;

export async function withdrawalHistory(
  args: WithdrawalHistoryArgs,
  opts?: PrivateHttpOptions,
): Promise<Result<Withdrawal[]>> {
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
  const result = await privateGet<unknown>("/user/withdrawal_history", params, opts);
  return parseResponse(result, ResponseSchema, "withdrawals");
}
