import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import { type PrivatePostOptions, privatePost } from "../../http-private-post.js";
import { parseResponse } from "../../parse-response.js";
import type { Result } from "../../types.js";
import { MSG_ORDER_IDS, PairSchema } from "../../validators.js";
import { CancelOrderSchema } from "../shared-schemas.js";
import { refineExecuteConfirm } from "./confirm-guard.js";
import { dryRunResult } from "./dry-run.js";

const CancelOrdersResponseSchema = z.object({
  orders: z.array(CancelOrderSchema),
});

export type CancelOrdersResponse = z.infer<typeof CancelOrdersResponseSchema>;

// bitbank API の一括キャンセル上限
const MAX_ORDER_IDS = 30;

const CancelOrdersInputSchema = z
  .object({
    pair: PairSchema,
    orderIds: z
      .string({ required_error: MSG_ORDER_IDS })
      .trim()
      .min(1, MSG_ORDER_IDS)
      .transform((s, ctx) => {
        const parts = s.split(",").map((x) => x.trim());
        if (parts.some((p) => !/^[1-9]\d*$/.test(p))) {
          ctx.addIssue({
            code: "custom",
            message: "order-ids must be comma-separated positive integers",
          });
          return z.NEVER;
        }
        const nums = parts.map(Number);
        if (nums.length > MAX_ORDER_IDS) {
          ctx.addIssue({
            code: "custom",
            message: `order-ids must be at most ${MAX_ORDER_IDS} items (got ${nums.length})`,
          });
          return z.NEVER;
        }
        return nums;
      }),
    execute: z.boolean().optional(),
    confirm: z.string().optional(),
  })
  .superRefine(refineExecuteConfirm("cancel-orders"));

export type CancelOrdersArgs = {
  pair?: string;
  orderIds?: string;
  execute?: boolean;
  confirm?: string;
};

export async function cancelOrders(
  args: CancelOrdersArgs,
  opts?: PrivatePostOptions,
): Promise<Result<CancelOrdersResponse | { dryRun: true }>> {
  const parsed = CancelOrdersInputSchema.safeParse({
    pair: args.pair,
    orderIds: args.orderIds,
    execute: args.execute,
    confirm: args.confirm,
  });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return { success: false, error: msg, exitCode: EXIT.PARAM };
  }

  const body = { pair: parsed.data.pair, order_ids: parsed.data.orderIds };

  if (!parsed.data.execute) {
    return dryRunResult({
      command: "cancel-orders",
      endpoint: "/v1/user/spot/cancel_orders",
      body,
      args: { pair: parsed.data.pair, orderIds: args.orderIds },
    });
  }

  const result = await privatePost<unknown>("/user/spot/cancel_orders", body, opts);
  return parseResponse(result, CancelOrdersResponseSchema);
}
