import { z } from "zod";
import { type PrivatePostOptions, privatePost } from "../../http-private-post.js";
import { parseResponse } from "../../parse-response.js";
import type { Result } from "../../types.js";
import { IntegerStringSchema } from "../../validators.js";
import { refineExecuteConfirm } from "./confirm-guard.js";
import { dryRunResult } from "./dry-run.js";

const ConfirmDepositsResponseSchema = z.object({
  uuid: z.string(),
  status: z.string(),
});

export type ConfirmDepositsResponse = z.infer<typeof ConfirmDepositsResponseSchema>;

const ConfirmDepositsInputSchema = z
  .object({
    id: IntegerStringSchema,
    execute: z.boolean().optional(),
    confirm: z.string().optional(),
  })
  .superRefine(refineExecuteConfirm("confirm-deposits"));

export type ConfirmDepositsArgs = {
  id?: string;
  execute?: boolean;
  confirm?: string;
};

export async function confirmDeposits(
  args: ConfirmDepositsArgs,
  opts?: PrivatePostOptions,
): Promise<Result<ConfirmDepositsResponse | { dryRun: true }>> {
  const parsed = ConfirmDepositsInputSchema.safeParse({
    id: args.id,
    execute: args.execute,
    confirm: args.confirm,
  });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return { success: false, error: msg };
  }

  const body = { id: parsed.data.id };

  if (!parsed.data.execute) {
    return dryRunResult({
      command: "confirm-deposits",
      endpoint: "/v1/user/confirm_deposits",
      body,
      args: { id: args.id },
    });
  }

  const result = await privatePost<unknown>("/user/confirm_deposits", body, opts);
  return parseResponse(result, ConfirmDepositsResponseSchema);
}
