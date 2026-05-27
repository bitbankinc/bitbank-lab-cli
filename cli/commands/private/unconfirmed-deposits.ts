import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import { type PrivateHttpOptions, privateGet } from "../../http-private.js";
import { compactParams } from "../../params.js";
import { parseResponse } from "../../parse-response.js";
import { numStr } from "../../schema-helpers.js";
import type { Result } from "../../types.js";
import { AssetSchema } from "../../validators.js";
import { formatZodError } from "./input-schemas.js";

const UnconfirmedDepositSchema = z.object({
  uuid: z.string(),
  asset: z.string(),
  amount: numStr,
  txid: z.string().nullable(),
  found_at: z.number(),
});

const ResponseSchema = z.object({
  deposits: z.array(UnconfirmedDepositSchema),
});

const RequestSchema = z.object({
  asset: AssetSchema.optional(),
});

export type UnconfirmedDeposit = z.infer<typeof UnconfirmedDepositSchema>;
export type UnconfirmedDepositsArgs = z.infer<typeof RequestSchema>;

export async function unconfirmedDeposits(
  args: UnconfirmedDepositsArgs,
  opts?: PrivateHttpOptions,
): Promise<Result<UnconfirmedDeposit[]>> {
  const parsed = RequestSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: formatZodError(parsed.error), exitCode: EXIT.PARAM };
  }
  const params = compactParams({ asset: parsed.data.asset });
  const result = await privateGet<unknown>("/user/unconfirmed_deposits", params, opts);
  return parseResponse(result, ResponseSchema, "deposits");
}
