import { z } from "zod";
import { nullableNumStr } from "../../../schema-helpers.js";

// WS circuit_break_info_<pair>。mode + 推定 itayose 価格 / 数量等の数値フィールドを正規化。
// mode 以外は実運用で揺れがあり得るため optional + passthrough にして互換性を確保。
export const CircuitBreakStreamSchema = z
  .object({
    mode: z.string(),
    estimated_itayose_price: nullableNumStr.optional(),
    estimated_itayose_amount: nullableNumStr.optional(),
  })
  .passthrough();
