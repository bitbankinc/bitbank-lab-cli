import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import { type PrivateHttpOptions, privateGet } from "../../http-private.js";
import { compactParams } from "../../params.js";
import { parseResponse } from "../../parse-response.js";
import { numStr } from "../../schema-helpers.js";
import type { Result } from "../../types.js";
import { AssetSchema } from "../../validators.js";
import { CountSchema, TimestampMsSchema, formatZodError, refineSinceEnd } from "./input-schemas.js";

const DepositSchema = z.object({
  uuid: z.string(),
  asset: z.string(),
  amount: numStr,
  // network/address/txid は暗号資産入金のみ。jpy 法定通貨入金では 3 つとも
  // キーごと欠落するため optional（公式 docs: deposit_history は bank account
  // 情報を含まない / txid は crypto のみ）。txid は crypto=文字列 / docs 上の
  // null / fiat=欠落 を許容（実機の jpy レコードで欠落を確認済み）。
  network: z.string().optional(),
  address: z.string().optional(),
  txid: z.string().nullable().optional(),
  status: z.string(),
  found_at: z.number(),
  // docs: "exists only for confirmed one"。FOUND では欠落 or null の双方を
  // 許容する安全側（nullable + optional）でパース失敗を防ぐ。
  confirmed_at: z.number().nullable().optional(),
});

const DepositHistoryResponseSchema = z.object({
  deposits: z.array(DepositSchema),
});

const RequestSchema = z
  .object({
    asset: AssetSchema.optional(),
    count: CountSchema.optional(),
    since: TimestampMsSchema.optional(),
    end: TimestampMsSchema.optional(),
  })
  .superRefine(refineSinceEnd);

export type Deposit = z.infer<typeof DepositSchema>;
export type DepositHistoryArgs = z.infer<typeof RequestSchema>;

export async function depositHistory(
  args: DepositHistoryArgs,
  opts?: PrivateHttpOptions,
): Promise<Result<Deposit[]>> {
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
  const result = await privateGet<unknown>("/user/deposit_history", params, opts);
  return parseResponse(result, DepositHistoryResponseSchema, "deposits");
}
