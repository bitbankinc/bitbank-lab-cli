import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import { type PrivatePostOptions, privatePost } from "../../http-private-post.js";
import { parseResponse } from "../../parse-response.js";
import type { DryRunData, Result } from "../../types.js";
import { formatZodError, UuidSchema } from "../../validators.js";
import { refineExecuteConfirm } from "./confirm-guard.js";
import { dryRunResult } from "./dry-run.js";

// 実 bitbank API `POST /user/confirm_deposits` は成功時 data を空 {} で返す
// （rest-api.md "Confirm deposits"）。必須フィールド付き schema では空 data を
// パースできず CLI が「失敗」を返し silent success を生むため、passthrough で
// 空 data を成功として受ける（将来フィールド追加にも耐性）。
const ConfirmDepositsResponseSchema = z.object({}).passthrough();

export type ConfirmDepositsResponse = z.infer<typeof ConfirmDepositsResponseSchema>;

type DepositPair = { uuid: string; originator_uuid: string };

const MSG_DEPOSITS =
  "deposits is required. Example: --deposits=<deposit-uuid>:<originator-uuid>,...";

const ConfirmDepositsInputSchema = z
  .object({
    deposits: z.string({ required_error: MSG_DEPOSITS }).trim().min(1, MSG_DEPOSITS),
    execute: z.boolean().optional(),
    confirm: z.string().optional(),
  })
  .superRefine(refineExecuteConfirm("confirm-deposits"));

export type ConfirmDepositsArgs = {
  deposits?: string;
  execute?: boolean;
  confirm?: string;
};

/** `<uuid>:<originator-uuid>,...` を検証済みペア配列へ。両 UUID は必須・形式検証。 */
function parseDeposits(raw: string): Result<DepositPair[]> {
  const pairs: DepositPair[] = [];
  for (const entry of raw.split(",")) {
    const parts = entry.split(":");
    const u = UuidSchema.safeParse(parts[0]?.trim());
    const o = UuidSchema.safeParse(parts[1]?.trim());
    if (parts.length !== 2 || !u.success || !o.success) {
      return {
        success: false,
        error: `deposit must be <uuid>:<originator-uuid> with valid UUIDs: "${entry}"`,
        exitCode: EXIT.PARAM,
      };
    }
    pairs.push({ uuid: u.data, originator_uuid: o.data });
  }
  return { success: true, data: pairs };
}

export async function confirmDeposits(
  args: ConfirmDepositsArgs,
  opts?: PrivatePostOptions,
): Promise<Result<ConfirmDepositsResponse | DryRunData>> {
  const parsed = ConfirmDepositsInputSchema.safeParse({
    deposits: args.deposits,
    execute: args.execute,
    confirm: args.confirm,
  });
  if (!parsed.success) {
    return { success: false, error: formatZodError(parsed.error), exitCode: EXIT.PARAM };
  }

  const deposits = parseDeposits(parsed.data.deposits);
  if (!deposits.success) return deposits;

  const body = { deposits: deposits.data };

  if (!parsed.data.execute) {
    return dryRunResult({
      command: "confirm-deposits",
      endpoint: "/v1/user/confirm_deposits",
      body,
      args: { deposits: args.deposits },
    });
  }

  const result = await privatePost<unknown>("/user/confirm_deposits", body, opts);
  return parseResponse(result, ConfirmDepositsResponseSchema);
}
