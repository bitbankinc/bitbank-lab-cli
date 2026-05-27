// 単一ページの約定履歴取得 (GET /user/spot/trade_history)
// 全件取得が必要な場合は trade-history-all.ts を使う（自動ページング）
import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import { type PrivateHttpOptions, privateGet } from "../../http-private.js";
import { compactParams } from "../../params.js";
import { parseResponse } from "../../parse-response.js";
import { numStr } from "../../schema-helpers.js";
import type { Result } from "../../types.js";
import { IntegerStringSchema, MSG_PAIR, PairSchema } from "../../validators.js";
import {
  CountSchema,
  OrderEnumSchema,
  TimestampMsSchema,
  formatZodError,
  refineSinceEnd,
} from "./input-schemas.js";

const TradeSchema = z.object({
  trade_id: z.number(),
  pair: z.string(),
  order_id: z.number(),
  side: z.string(),
  type: z.string(),
  amount: numStr,
  price: numStr,
  maker_taker: z.string(),
  fee_amount_base: numStr,
  fee_amount_quote: numStr,
  executed_at: z.number(),
});

const TradeHistoryResponseSchema = z.object({
  trades: z.array(TradeSchema),
});

const RequestSchema = z
  .object({
    pair: PairSchema.optional(),
    count: CountSchema.optional(),
    orderId: IntegerStringSchema.optional(),
    since: TimestampMsSchema.optional(),
    end: TimestampMsSchema.optional(),
    order: OrderEnumSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.pair === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: MSG_PAIR, path: ["pair"] });
    }
    refineSinceEnd(val, ctx);
  });

export type Trade = z.infer<typeof TradeSchema>;
export type TradeHistoryArgs = z.infer<typeof RequestSchema>;

export async function tradeHistory(
  args: TradeHistoryArgs,
  opts?: PrivateHttpOptions,
): Promise<Result<Trade[]>> {
  const parsed = RequestSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: formatZodError(parsed.error), exitCode: EXIT.PARAM };
  }
  const params = compactParams({
    pair: parsed.data.pair,
    count: parsed.data.count,
    order_id: parsed.data.orderId,
    since: parsed.data.since,
    end: parsed.data.end,
    order: parsed.data.order,
  });
  const result = await privateGet<unknown>("/user/spot/trade_history", params, opts);
  return parseResponse(result, TradeHistoryResponseSchema, "trades");
}

/** --all 分岐を吸収するディスパッチ関数 */
export async function tradeHistoryDispatch(
  args: TradeHistoryArgs & { all: boolean },
  opts?: PrivateHttpOptions,
): Promise<Result<Trade[]>> {
  if (args.all) {
    const { tradeHistoryAll } = await import("./trade-history-all.js");
    return tradeHistoryAll({ pair: args.pair, since: args.since, end: args.end }, opts);
  }
  return tradeHistory(args, opts);
}
