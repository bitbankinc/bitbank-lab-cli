import { z } from "zod";
import { type PrivateHttpOptions, privateGet } from "../../http-private.js";
import { compactParams } from "../../params.js";
import { parseResponse } from "../../parse-response.js";
import { numStr } from "../../schema-helpers.js";
import type { Result } from "../../types.js";

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

export type UnconfirmedDeposit = z.infer<typeof UnconfirmedDepositSchema>;

export async function unconfirmedDeposits(
  args: { asset?: string },
  opts?: PrivateHttpOptions,
): Promise<Result<UnconfirmedDeposit[]>> {
  const { asset } = args;
  const params = compactParams({ asset });

  const result = await privateGet<unknown>("/user/unconfirmed_deposits", params, opts);
  return parseResponse(result, ResponseSchema, "deposits");
}
