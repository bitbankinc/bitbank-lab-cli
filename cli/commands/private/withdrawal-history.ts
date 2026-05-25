import { z } from "zod";
import { type PrivateHttpOptions, privateGet } from "../../http-private.js";
import { compactParams } from "../../params.js";
import { parseResponse } from "../../parse-response.js";
import { numStr } from "../../schema-helpers.js";
import type { Result } from "../../types.js";
import { MSG_ASSET } from "../../validators.js";

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

export type Withdrawal = z.infer<typeof WithdrawalSchema>;

export async function withdrawalHistory(
  args: { asset: string | undefined; count?: string; since?: string; end?: string },
  opts?: PrivateHttpOptions,
): Promise<Result<Withdrawal[]>> {
  const { asset, count, since, end } = args;
  if (!asset) {
    return { success: false, error: MSG_ASSET };
  }
  const params = compactParams({ asset, count, since, end });

  const result = await privateGet<unknown>("/user/withdrawal_history", params, opts);
  return parseResponse(result, ResponseSchema, "withdrawals");
}
