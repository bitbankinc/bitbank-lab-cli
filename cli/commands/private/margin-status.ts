import { z } from "zod";
import { type PrivateHttpOptions, privateGet } from "../../http-private.js";
import { parseResponse } from "../../parse-response.js";
import { nullableNumStr, numStr } from "../../schema-helpers.js";
import type { Result } from "../../types.js";

// ペア別の利用可能残高（買建/売建それぞれの建玉余力）
const AvailableBalanceSchema = z.object({
  pair: z.string(),
  long: numStr,
  short: numStr,
});

const MarginStatusSchema = z.object({
  status: z.string(),
  total_margin_balance: numStr,
  total_margin_balance_percentage: nullableNumStr,
  margin_position_profit_loss: numStr,
  margin_call_percentage: nullableNumStr,
  losscut_percentage: nullableNumStr,
  buy_credit: numStr,
  sell_credit: numStr,
  // 建玉・注文サイズとコスト
  unrealized_cost: numStr,
  total_margin_position_product: numStr,
  open_margin_position_product: numStr,
  open_margin_order_product: numStr,
  // 維持証拠金（建玉・注文 × 買建/売建）
  total_position_maintenance_margin: numStr,
  total_long_position_maintenance_margin: numStr,
  total_short_position_maintenance_margin: numStr,
  total_open_order_maintenance_margin: numStr,
  total_long_open_order_maintenance_margin: numStr,
  total_short_open_order_maintenance_margin: numStr,
  available_balances: z.array(AvailableBalanceSchema),
});

export type MarginStatus = z.infer<typeof MarginStatusSchema>;

export async function marginStatus(opts?: PrivateHttpOptions): Promise<Result<MarginStatus>> {
  const result = await privateGet<unknown>("/user/margin/status", undefined, opts);
  return parseResponse(result, MarginStatusSchema);
}
