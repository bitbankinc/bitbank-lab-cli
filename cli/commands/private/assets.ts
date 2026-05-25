import { z } from "zod";
import { type PrivateHttpOptions, privateGet } from "../../http-private.js";
import { numStr } from "../../schema-helpers.js";
import type { Result } from "../../types.js";

const AssetSchema = z.object({
  asset: z.string(),
  free_amount: numStr,
  locked_amount: numStr,
  onhand_amount: numStr,
  withdrawing_amount: numStr,
});

const AssetsResponseSchema = z.object({
  assets: z.array(AssetSchema),
});

export type Asset = z.infer<typeof AssetSchema>;

export async function assets(
  args: { showAll: boolean },
  opts?: PrivateHttpOptions,
): Promise<Result<Asset[]>> {
  const { showAll } = args;
  const result = await privateGet<unknown>("/user/assets", undefined, opts);
  if (!result.success) return result;

  const parsed = AssetsResponseSchema.safeParse(result.data);
  if (!parsed.success) {
    return { success: false, error: `Invalid response: ${parsed.error.message}` };
  }

  const items = showAll
    ? parsed.data.assets
    : parsed.data.assets.filter((a) => a.onhand_amount > 0);

  return { success: true, data: items };
}
