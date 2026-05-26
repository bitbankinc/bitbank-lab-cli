import { z } from "zod";
import { numStr } from "../../../schema-helpers.js";

// WS depth_diff_<pair> と depth_whole_<pair> 共通のスキーマ。
// asks/bids はどちらも [price, amount] の tuple（REST /depth と同型）。
// depth_diff の差分更新で片側のみ届くケースもあるため optional。
// timestamp / sequence 等の追加フィールドは passthrough で温存。
const PriceAmount = z.tuple([numStr, numStr]);

export const DepthStreamSchema = z
  .object({
    asks: z.array(PriceAmount).optional(),
    bids: z.array(PriceAmount).optional(),
    timestamp: z.number().optional(),
  })
  .passthrough();
