import { z } from "zod";
import { type PrivateHttpOptions, privateGet } from "../../http-private.js";
import { compactParams } from "../../params.js";
import { parseResponse } from "../../parse-response.js";
import { nullableNumStr, numStr } from "../../schema-helpers.js";
import type { Result } from "../../types.js";
import { validatePair } from "../../validators.js";

const PositionSchema = z.object({
  pair: z.string(),
  position_side: z.string(),
  open_amount: numStr,
  product: numStr,
  average_price: numStr,
  unrealized_fee_amount: numStr,
  unrealized_interest_amount: numStr,
});

// 追証等のイベント通知。発生していないときは API が省略 / 各値 null を返すため
// notice 自体を nullable+optional、内側も全て nullable にして「追証発生時だけ
// パース失敗」を防ぐ（occurred_at / due_date_at は Unix ms の number）。
const NoticeSchema = z.object({
  what: z.string().nullable(),
  occurred_at: z.number().nullable(),
  amount: nullableNumStr,
  due_date_at: z.number().nullable(),
});

const PayablesSchema = z.object({
  amount: numStr,
});

// 強制決済しきい値（individual: 個別設定 / company: 会社規定）
const LosscutThresholdSchema = z.object({
  individual: numStr,
  company: numStr,
});

const ResponseSchema = z.object({
  notice: NoticeSchema.nullable().optional(),
  payables: PayablesSchema,
  positions: z.array(PositionSchema),
  losscut_threshold: LosscutThresholdSchema,
});

export type MarginPositions = z.infer<typeof ResponseSchema>;

export async function marginPositions(
  args: { pair?: string },
  opts?: PrivateHttpOptions,
): Promise<Result<MarginPositions>> {
  const { pair } = args;
  let normalizedPair = pair;
  if (pair !== undefined) {
    const pv = validatePair(pair);
    if (!pv.success) return pv;
    normalizedPair = pv.data;
  }
  const params = compactParams({ pair: normalizedPair });

  const result = await privateGet<unknown>("/user/margin/positions", params, opts);
  return parseResponse(result, ResponseSchema);
}
