import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import {
  type PaperState,
  defaultStatePath,
  loadState,
  nowIso,
  saveState,
} from "../../paper-state.js";
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
  const existing = await loadState(path);
  if (!existing.success) return existing;
  if (existing.data && !parsed.data.force) {
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
  const w = await saveState(state, path);
  if (!w.success) return w;
  return { success: true, data: state };
}
