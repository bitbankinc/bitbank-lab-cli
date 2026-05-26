import { z } from "zod";
import { type PrivatePostOptions, privatePost } from "../../http-private-post.js";
import { parseResponse } from "../../parse-response.js";
import type { Result } from "../../types.js";
import { IntegerStringSchema, PairSchema } from "../../validators.js";
import { CancelOrderSchema } from "../shared-schemas.js";
import { refineExecuteConfirm } from "./confirm-guard.js";
import { dryRunResult } from "./dry-run.js";

const CancelOrderInputSchema = z
  .object({
    pair: PairSchema,
    orderId: IntegerStringSchema,
    execute: z.boolean().optional(),
    confirm: z.string().optional(),
  })
  .superRefine(refineExecuteConfirm("cancel-order"));

export type CancelOrderResponse = z.infer<typeof CancelOrderSchema>;

export type CancelOrderArgs = {
  pair?: string;
  orderId?: string;
  execute?: boolean;
  confirm?: string;
};

export async function cancelOrder(
  args: CancelOrderArgs,
  opts?: PrivatePostOptions,
): Promise<Result<CancelOrderResponse | { dryRun: true }>> {
  const parsed = CancelOrderInputSchema.safeParse({
    pair: args.pair,
    orderId: args.orderId,
    execute: args.execute,
    confirm: args.confirm,
  });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return { success: false, error: msg };
  }

  const body = { pair: parsed.data.pair, order_id: Number(parsed.data.orderId) };

  if (!parsed.data.execute) {
    return dryRunResult({
      command: "cancel-order",
      endpoint: "/v1/user/spot/cancel_order",
      body,
      args: { pair: parsed.data.pair, orderId: parsed.data.orderId },
    });
  }

  const result = await privatePost<unknown>("/user/spot/cancel_order", body, opts);
  return parseResponse(result, CancelOrderSchema);
}
