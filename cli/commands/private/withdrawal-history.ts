import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import { type PrivateHttpOptions, privateGet } from "../../http-private.js";
import { compactParams } from "../../params.js";
import { parseResponse } from "../../parse-response.js";
import { numStr } from "../../schema-helpers.js";
import type { Result } from "../../types.js";
import { AssetSchema } from "../../validators.js";
import { CountSchema, formatZodError, refineSinceEnd, TimestampMsSchema } from "./input-schemas.js";

const WithdrawalSchema = z.object({
  // 常時返る項目（crypto / fiat 共通）
  uuid: z.string(),
  asset: z.string(),
  account_uuid: z.string(),
  amount: numStr,
  fee: numStr,
  status: z.string(),
  requested_at: z.number(),
  // 暗号資産出金のみ。fiat（jpy）出金では欠落し得るため nullable + optional の
  // 安全側（キー欠落・null の双方を許容してパース失敗を防ぐ）。
  label: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  network: z.string().nullable().optional(),
  // destination_tag は資産依存で number / string 双方があり得る（XRP 等）。
  destination_tag: z.union([z.number(), z.string()]).nullable().optional(),
  txid: z.string().nullable().optional(),
  // 法定通貨（fiat）出金のみ。crypto 出金では欠落し得るため同じく安全側。
  bank_name: z.string().nullable().optional(),
  branch_name: z.string().nullable().optional(),
  account_type: z.string().nullable().optional(),
  account_number: z.string().nullable().optional(),
  account_owner: z.string().nullable().optional(),
});

const ResponseSchema = z.object({
  withdrawals: z.array(WithdrawalSchema),
});

const RequestSchema = z
  .object({
    asset: AssetSchema,
    count: CountSchema.optional(),
    since: TimestampMsSchema.optional(),
    end: TimestampMsSchema.optional(),
  })
  .superRefine(refineSinceEnd);

export type Withdrawal = z.infer<typeof WithdrawalSchema>;
export type WithdrawalHistoryArgs = z.infer<typeof RequestSchema>;

export async function withdrawalHistory(
  args: WithdrawalHistoryArgs,
  opts?: PrivateHttpOptions,
): Promise<Result<Withdrawal[]>> {
  const parsed = RequestSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: formatZodError(parsed.error), exitCode: EXIT.PARAM };
  }
  const params = compactParams({
    asset: parsed.data.asset,
    count: parsed.data.count,
    since: parsed.data.since,
    end: parsed.data.end,
  });
  const result = await privateGet<unknown>("/user/withdrawal_history", params, opts);
  return parseResponse(result, ResponseSchema, "withdrawals");
}
