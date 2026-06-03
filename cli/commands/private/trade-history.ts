// 単一ページの約定履歴取得 (GET /user/spot/trade_history)
// 全件取得が必要な場合は trade-history-all.ts を使う（自動ページング）
import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import { type PrivateHttpOptions, privateGet } from "../../http-private.js";
import { compactParams } from "../../params.js";
import { parseResponse } from "../../parse-response.js";
import { nullableNumStr, numStr, safeId } from "../../schema-helpers.js";
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
  trade_id: safeId,
  pair: z.string(),
  order_id: safeId,
  side: z.string(),
  type: z.string(),
  amount: numStr,
  price: numStr,
  maker_taker: z.string(),
  fee_amount_base: numStr,
  fee_amount_quote: numStr,
  // spot でも常時返る（docs: spot では fee_amount_quote と同値）。監査 ISSUE-F
  fee_occurred_amount_quote: numStr,
  executed_at: z.number(),
  position_side: z.string().optional(), // margin のみ
  profit_loss: nullableNumStr.optional(), // 実現損益。省略あり
  interest: nullableNumStr.optional(), // 金利。省略あり
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
  args: TradeHistoryArgs & { all: boolean; maxPages?: string },
  opts?: PrivateHttpOptions,
): Promise<Result<Trade[]>> {
  if (args.all) {
    const { tradeHistoryAll } = await import("./trade-history-all.js");
    return tradeHistoryAll(
      { pair: args.pair, since: args.since, end: args.end, maxPages: args.maxPages },
      opts,
    );
  }
  return tradeHistory(args, opts);
}
