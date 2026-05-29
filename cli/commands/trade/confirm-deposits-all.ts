import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import { type PrivatePostOptions, privatePost } from "../../http-private-post.js";
import { parseResponse } from "../../parse-response.js";
import type { Result } from "../../types.js";
import { refineExecuteConfirm } from "./confirm-guard.js";
import { dryRunResult } from "./dry-run.js";

const ConfirmDepositsAllResponseSchema = z.object({
  status: z.string(),
});

export type ConfirmDepositsAllResponse = z.infer<typeof ConfirmDepositsAllResponseSchema>;

const ConfirmDepositsAllInputSchema = z
  .object({
    execute: z.boolean().optional(),
    confirm: z.string().optional(),
  })
  .superRefine(refineExecuteConfirm("confirm-deposits-all"));

export type ConfirmDepositsAllArgs = {
  execute?: boolean;
  confirm?: string;
};

export async function confirmDepositsAll(
  args: ConfirmDepositsAllArgs,
  opts?: PrivatePostOptions,
): Promise<Result<ConfirmDepositsAllResponse | { dryRun: true }>> {
  const parsed = ConfirmDepositsAllInputSchema.safeParse({
    execute: args.execute,
    confirm: args.confirm,
  });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return { success: false, error: msg, exitCode: EXIT.PARAM };
  }

  if (!parsed.data.execute) {
    return dryRunResult({
      command: "confirm-deposits-all",
      endpoint: "/v1/user/confirm_deposits_all",
      body: {},
      args: {},
    });
  }

  const result = await privatePost<unknown>("/user/confirm_deposits_all", undefined, opts);
  return parseResponse(result, ConfirmDepositsAllResponseSchema);
}
