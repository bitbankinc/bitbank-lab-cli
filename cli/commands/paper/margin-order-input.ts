// paper create-margin-order の入力（ADR-010 決定 2）。本番の trade create-margin-order（ADR-009）と同じ語彙:
// --position-side は必須（long|short）、--intent は任意（open|close）。注文種別は paper の現物と同じく market / limit だけで、
// stop / stop_limit / take_profit / stop_loss / losscut は enum に無いので PARAM で拒否される。
import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import { MarginIntentSchema, PositionSideSchema } from "../../margin-operation.js";
import type { FetchCandles, GetPairs } from "../../paper-fill.js";
import type { Result } from "../../types.js";
import { formatZodError, PairSchema, PositiveDecimalSchema } from "../../validators.js";

const InputSchema = z
  .object({
    pair: PairSchema,
    side: z.enum(["buy", "sell"]),
    positionSide: PositionSideSchema,
    type: z.enum(["market", "limit"]),
    amount: PositiveDecimalSchema,
    price: PositiveDecimalSchema.optional(),
    intent: MarginIntentSchema.optional(),
  })
  .refine((v) => v.type !== "limit" || v.price !== undefined, {
    message: "--price is required for limit orders",
  });

export type PaperCreateMarginOrderArgs = {
  pair?: string;
  side?: string;
  positionSide?: string;
  type?: string;
  amount?: string;
  price?: string;
  intent?: string;
  statePath?: string;
  fetchCandles?: FetchCandles;
  fetchCoarseCandles?: FetchCandles;
  getPairs?: GetPairs;
  nowMs?: number;
};

export type MarginOrderInput = Omit<z.infer<typeof InputSchema>, "amount" | "price"> & {
  amount: number;
  price?: number;
};

export function parseMarginOrderInput(args: PaperCreateMarginOrderArgs): Result<MarginOrderInput> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: formatZodError(parsed.error), exitCode: EXIT.PARAM };
  }
  const { amount, price, ...rest } = parsed.data;
  return {
    success: true,
    data: {
      ...rest,
      amount: Number(amount),
      price: price === undefined ? undefined : Number(price),
    },
  };
}
