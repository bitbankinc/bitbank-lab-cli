import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import { type PrivateHttpOptions, privateGet } from "../../http-private.js";
import { parseResponse } from "../../parse-response.js";
import type { Result } from "../../types.js";
import { MSG_ASSET } from "../../validators.js";

const AccountSchema = z.object({
  uuid: z.string(),
  label: z.string(),
  address: z.string(),
});

const ResponseSchema = z.object({
  accounts: z.array(AccountSchema),
});

export type WithdrawalAccount = z.infer<typeof AccountSchema>;

export async function withdrawalAccounts(
  args: { asset: string | undefined },
  opts?: PrivateHttpOptions,
): Promise<Result<WithdrawalAccount[]>> {
  const { asset } = args;
  if (!asset) {
    return { success: false, error: MSG_ASSET, exitCode: EXIT.PARAM };
  }
  const params: Record<string, string> = { asset };

  const result = await privateGet<unknown>("/user/withdrawal_account", params, opts);
  return parseResponse(result, ResponseSchema, "accounts");
}
