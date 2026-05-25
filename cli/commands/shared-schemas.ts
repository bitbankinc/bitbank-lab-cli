import { z } from "zod";
import { nullableNumStr, numStr } from "../schema-helpers.js";

/** 注文レスポンスの共通スキーマ（/user/spot/order 等） */
export const OrderSchema = z.object({
  order_id: z.number(),
  pair: z.string(),
  side: z.string(),
  type: z.string(),
  start_amount: nullableNumStr.optional(),
  remaining_amount: nullableNumStr.optional(),
  executed_amount: numStr,
  price: nullableNumStr.optional(),
  post_only: z.boolean().optional(),
  average_price: numStr,
  ordered_at: z.number(),
  expire_at: z.number().nullable().optional(),
  status: z.string(),
});

/** キャンセルレスポンスのスキーマ（OrderSchema のサブセット） */
export const CancelOrderSchema = OrderSchema.pick({
  order_id: true,
  pair: true,
  side: true,
  type: true,
  price: true,
  status: true,
});

/** ティッカーのベーススキーマ（単一ペア用） */
export const TickerSchema = z.object({
  sell: nullableNumStr,
  buy: nullableNumStr,
  high: nullableNumStr,
  low: nullableNumStr,
  open: nullableNumStr,
  last: nullableNumStr,
  vol: nullableNumStr,
  timestamp: z.number(),
});

/** /tickers 用（pair フィールド付き） */
export const TickerWithPairSchema = TickerSchema.extend({
  pair: z.string(),
});
