import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import { type FetchCandles, type GetPairs, runTick } from "../../paper-fill.js";
import { defaultStatePath, nowIso, type OpenOrder, type PaperState } from "../../paper-state.js";
import { updateState } from "../../paper-state-mutate.js";
import type { Result } from "../../types.js";
import { formatZodError } from "../../validators.js";

const InputSchema = z.object({ id: z.string().trim().min(1, "--id is required") });

export type PaperCancelOrderArgs = {
  id?: string;
  statePath?: string;
  fetchCandles?: FetchCandles;
  getPairs?: GetPairs;
  nowMs?: number;
  feeRate?: number;
};

export async function paperCancelOrder(
  args: PaperCancelOrderArgs,
): Promise<Result<{ canceled: OpenOrder }>> {
  const parsed = InputSchema.safeParse({ id: args.id });
  if (!parsed.success) {
    return {
      success: false,
      error: formatZodError(parsed.error),
      exitCode: EXIT.PARAM,
    };
  }
  const path = args.statePath ?? defaultStatePath();
  // 価格に触れていれば cancel より fill を優先する（先に lazy tick で解決）。
  const tick = await runTick({
    statePath: path,
    fetchCandles: args.fetchCandles,
    getPairs: args.getPairs,
    nowMs: args.nowMs,
    feeRate: args.feeRate,
  });
  if (!tick.success) return tick;
  return updateState<{ canceled: OpenOrder }>(
    (state) => {
      if (!state) {
        return {
          success: false,
          error: "paper state not initialized. Run 'bitbank paper init --jpy=<amount>' first.",
        };
      }
      const target = state.openOrders.find((o) => o.id === parsed.data.id);
      if (!target) {
        return {
          success: false,
          error: `open order not found: ${parsed.data.id} (may have already filled)`,
        };
      }
      const updatedAt = nowIso();
      const newState: PaperState = {
        ...state,
        updatedAt,
        openOrders: state.openOrders.filter((o) => o.id !== parsed.data.id),
      };
      return { success: true, data: { state: newState, result: { canceled: target } } };
    },
    { path },
  );
}
