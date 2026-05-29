import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import { type PrivateHttpOptions, privateGet } from "../../http-private.js";
import { parseResponse } from "../../parse-response.js";
import type { Result } from "../../types.js";
import { MSG_ASSET } from "../../validators.js";

const OriginatorSchema = z.object({
  uuid: z.string(),
  label: z.string(),
  address: z.string(),
  asset: z.string(),
  network: z.string().optional(),
});

const ResponseSchema = z.object({
  originators: z.array(OriginatorSchema),
});

export type DepositOriginator = z.infer<typeof OriginatorSchema>;

export async function depositOriginators(
  args: { asset: string | undefined },
  opts?: PrivateHttpOptions,
): Promise<Result<DepositOriginator[]>> {
  const { asset } = args;
  if (!asset) {
    return { success: false, error: MSG_ASSET, exitCode: EXIT.PARAM };
  }
  const params: Record<string, string> = { asset };

  const result = await privateGet<unknown>("/user/deposit_originators", params, opts);
  return parseResponse(result, ResponseSchema, "originators");
}
