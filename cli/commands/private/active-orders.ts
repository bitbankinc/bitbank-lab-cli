import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import { type PrivateHttpOptions, privateGet } from "../../http-private.js";
import { compactParams } from "../../params.js";
import { parseResponse } from "../../parse-response.js";
import type { Result } from "../../types.js";
import { PairSchema } from "../../validators.js";
import { OrderSchema } from "../shared-schemas.js";
import { CountSchema, formatZodError, refineSinceEnd, TimestampMsSchema } from "./input-schemas.js";

const ActiveOrdersResponseSchema = z.object({
  orders: z.array(OrderSchema),
});

const RequestSchema = z
  .object({
    pair: PairSchema.optional(),
    count: CountSchema.optional(),
    since: TimestampMsSchema.optional(),
    end: TimestampMsSchema.optional(),
  })
  .superRefine(refineSinceEnd);

export type ActiveOrder = z.infer<typeof OrderSchema>;
export type ActiveOrdersArgs = z.infer<typeof RequestSchema>;

export async function activeOrders(
  args: ActiveOrdersArgs,
  opts?: PrivateHttpOptions,
): Promise<Result<ActiveOrder[]>> {
  const parsed = RequestSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: formatZodError(parsed.error), exitCode: EXIT.PARAM };
  }
  const params = compactParams({
    pair: parsed.data.pair,
    count: parsed.data.count,
    since: parsed.data.since,
    end: parsed.data.end,
  });
  const result = await privateGet<unknown>("/user/spot/active_orders", params, opts);
  return parseResponse(result, ActiveOrdersResponseSchema, "orders");
}
