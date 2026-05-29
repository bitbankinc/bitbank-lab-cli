import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import { type PrivatePostOptions, privatePost } from "../../http-private-post.js";
import { parseResponse } from "../../parse-response.js";
import type { Result } from "../../types.js";
import { MSG_ORDER_IDS_INFO, validatePair } from "../../validators.js";
import { OrderSchema } from "../shared-schemas.js";

const OrdersInfoResponseSchema = z.object({
  orders: z.array(OrderSchema),
});

export type OrderInfo = z.infer<typeof OrderSchema>;

export async function ordersInfo(
  args: { pair: string | undefined; orderIds: string | undefined },
  opts?: PrivatePostOptions,
): Promise<Result<OrderInfo[]>> {
  const pv = validatePair(args.pair);
  if (!pv.success) return pv;
  const { orderIds } = args;
  if (!orderIds) {
    return { success: false, error: MSG_ORDER_IDS_INFO, exitCode: EXIT.PARAM };
  }
  const parts = orderIds.split(",").map((s) => s.trim());
  if (parts.some((p) => !/^[1-9]\d*$/.test(p))) {
    return {
      success: false,
      error: "order-ids must be comma-separated positive integers. Example: --order-ids=123,456",
      exitCode: EXIT.PARAM,
    };
  }
  const ids = parts.map(Number);
  const body = { pair: pv.data, order_ids: ids };
  const result = await privatePost<unknown>("/user/spot/orders_info", body, opts);
  return parseResponse(result, OrdersInfoResponseSchema, "orders");
}
