import type { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import { type PrivateHttpOptions, privateGet } from "../../http-private.js";
import { parseResponse } from "../../parse-response.js";
import type { Result } from "../../types.js";
import {
  formatZodError,
  IntegerStringSchema,
  MSG_ORDER_ID,
  validatePair,
} from "../../validators.js";
import { OrderSchema } from "../shared-schemas.js";

export type Order = z.infer<typeof OrderSchema>;

export async function order(
  args: { pair: string | undefined; orderId: string | undefined },
  opts?: PrivateHttpOptions,
): Promise<Result<Order>> {
  const pv = validatePair(args.pair);
  if (!pv.success) return pv;
  if (!args.orderId) {
    return { success: false, error: MSG_ORDER_ID, exitCode: EXIT.PARAM };
  }
  const idv = IntegerStringSchema.safeParse(args.orderId);
  if (!idv.success) {
    return {
      success: false,
      error: formatZodError(idv.error),
      exitCode: EXIT.PARAM,
    };
  }
  const params: Record<string, string> = { pair: pv.data, order_id: idv.data };
  const result = await privateGet<unknown>("/user/spot/order", params, opts);
  return parseResponse(result, OrderSchema);
}
