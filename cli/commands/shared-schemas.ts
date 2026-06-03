import { z } from "zod";
import { nullableNumStr, numStr, safeId } from "../schema-helpers.js";

/** 注文レスポンスの共通スキーマ（/user/spot/order 等） */
export const OrderSchema = z.object({
  order_id: safeId,
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
  // 以下、実 API が返すが従来未露出だったフィールド（追加のみ・監査 ISSUE-F）
  position_side: z.string().optional(), // margin のみ（long/short）。spot では省略
  user_cancelable: z.boolean().optional(), // キャンセル可否。安全側で optional
  triggered_at: z.number().optional(), // stop 系の発火時刻（Unix ms）
  trigger_price: nullableNumStr.optional(), // stop 系のトリガー価格
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
