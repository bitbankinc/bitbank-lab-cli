// 100行超: 入力検証 + body 組立に加え、dry-run の手数料見積り解決経路を含むため
// （見積り計算自体は cli/fees.ts に委譲。ここはオーケストレーションのみ）。
import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import { type GetPairs, resolveDryRunFee } from "../../fees.js";
import { type PrivatePostOptions, privatePost } from "../../http-private-post.js";
import { parseResponse } from "../../parse-response.js";
import type { DryRunData, Result } from "../../types.js";
import { formatZodError, PairSchema, PositiveDecimalSchema } from "../../validators.js";
import { OrderSchema } from "../shared-schemas.js";
import { refineExecuteConfirm } from "./confirm-guard.js";
import { dryRunResult } from "./dry-run.js";

const SideEnum = z.enum(["buy", "sell"]);
const TypeEnum = z.enum(["limit", "market", "stop", "stop_limit"]);

const CreateOrderInputSchema = z
  .object({
    pair: PairSchema,
    side: SideEnum,
    type: TypeEnum,
    price: PositiveDecimalSchema.optional(),
    amount: PositiveDecimalSchema,
    triggerPrice: PositiveDecimalSchema.optional(),
    postOnly: z.boolean().optional(),
    execute: z.boolean().optional(),
    confirm: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if ((val.type === "limit" || val.type === "stop_limit") && !val.price) {
      ctx.addIssue({ code: "custom", message: `price is required for type=${val.type}` });
    }
    if ((val.type === "stop" || val.type === "stop_limit") && !val.triggerPrice) {
      ctx.addIssue({ code: "custom", message: `trigger-price is required for type=${val.type}` });
    }
    refineExecuteConfirm("create-order")(val, ctx);
  });

export type OrderResponse = z.infer<typeof OrderSchema>;

export type CreateOrderArgs = {
  pair?: string;
  side?: string;
  type?: string;
  price?: string;
  amount?: string;
  triggerPrice?: string;
  postOnly?: boolean;
  execute?: boolean;
  confirm?: string;
  // pairs 取得の注入 seam（テストで実 API を叩かないため）。
  getPairs?: GetPairs;
};

export async function createOrder(
  args: CreateOrderArgs,
  opts?: PrivatePostOptions,
): Promise<Result<OrderResponse | DryRunData>> {
  const parsed = CreateOrderInputSchema.safeParse({
    pair: args.pair,
    side: args.side,
    type: args.type,
    price: args.price,
    amount: args.amount,
    triggerPrice: args.triggerPrice,
    postOnly: args.postOnly,
    execute: args.execute,
    confirm: args.confirm,
  });
  if (!parsed.success) {
    return { success: false, error: formatZodError(parsed.error), exitCode: EXIT.PARAM };
  }

  const body: Record<string, unknown> = {
    pair: parsed.data.pair,
    side: parsed.data.side,
    type: parsed.data.type,
    amount: parsed.data.amount,
  };
  if (parsed.data.price) body.price = parsed.data.price;
  if (parsed.data.triggerPrice) body.trigger_price = parsed.data.triggerPrice;
  if (parsed.data.postOnly) body.post_only = true;

  if (!parsed.data.execute) {
    // dry-run のみライブ手数料を引いて見積りを足す（public GET 1回・private/POST 不可）。
    const fee = await resolveDryRunFee(parsed.data, args.getPairs);
    return dryRunResult({
      command: "create-order",
      endpoint: "/v1/user/spot/order",
      body,
      args: {
        pair: parsed.data.pair,
        side: parsed.data.side,
        type: parsed.data.type,
        price: parsed.data.price,
        amount: parsed.data.amount,
        triggerPrice: parsed.data.triggerPrice,
        postOnly: parsed.data.postOnly,
      },
      fee,
    });
  }

  const result = await privatePost<unknown>("/user/spot/order", body, opts);
  return parseResponse(result, OrderSchema);
}
