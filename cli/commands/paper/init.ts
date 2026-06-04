import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import { defaultStatePath, nowIso, type PaperState } from "../../paper-state.js";
import { updateState } from "../../paper-state-mutate.js";
import type { Result } from "../../types.js";
import { PositiveDecimalSchema } from "../../validators.js";

const InitInputSchema = z.object({
  jpy: PositiveDecimalSchema,
  force: z.boolean().optional(),
});

export type PaperInitArgs = {
  jpy?: string;
  force?: boolean;
  statePath?: string;
};

export async function paperInit(args: PaperInitArgs): Promise<Result<PaperState>> {
  const parsed = InitInputSchema.safeParse({ jpy: args.jpy, force: args.force });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
      exitCode: EXIT.PARAM,
    };
  }
  const path = args.statePath ?? defaultStatePath();
  return updateState<PaperState>(
    (existing) => {
      if (existing && !parsed.data.force) {
        return {
          success: false,
          error: "paper state already exists. Use --force to overwrite.",
        };
      }
      const initialJpy = Number(parsed.data.jpy);
      const now = nowIso();
      const state: PaperState = {
        version: 3,
        createdAt: now,
        updatedAt: now,
        initialJpy,
        balances: { jpy: initialJpy },
        history: [],
        lastTickAt: now,
        openOrders: [],
      };
      return { success: true, data: { state, result: state } };
    },
    { path },
  );
}
