import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import { type FetchCandles, type GetPairs, type TickResult, runTick } from "../../paper-fill.js";
import type { Result } from "../../types.js";
import { PairSchema } from "../../validators.js";

const InputSchema = z.object({ pair: PairSchema.optional() });

export type PaperTickArgs = {
  pair?: string;
  statePath?: string;
  fetchCandles?: FetchCandles;
  getPairs?: GetPairs;
  nowMs?: number;
  feeRate?: number;
};

export async function paperTick(args: PaperTickArgs = {}): Promise<Result<TickResult>> {
  const parsed = InputSchema.safeParse({ pair: args.pair });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
      exitCode: EXIT.PARAM,
    };
  }
  return runTick({
    statePath: args.statePath,
    pair: parsed.data.pair,
    fetchCandles: args.fetchCandles,
    getPairs: args.getPairs,
    nowMs: args.nowMs,
    feeRate: args.feeRate,
  });
}
