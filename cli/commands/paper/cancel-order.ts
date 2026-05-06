import { z } from "zod";
import { type FetchCandles, runTick } from "../../paper-fill.js";
import {
  type OpenOrder,
  type PaperState,
  defaultStatePath,
  loadState,
  nowIso,
  saveState,
} from "../../paper-state.js";
import type { Result } from "../../types.js";

const InputSchema = z.object({ id: z.string().trim().min(1, "--id is required") });

export type PaperCancelOrderArgs = {
  id?: string;
  statePath?: string;
  fetchCandles?: FetchCandles;
  nowMs?: number;
  feeRate?: number;
};

export async function paperCancelOrder(
  args: PaperCancelOrderArgs,
): Promise<Result<{ canceled: OpenOrder }>> {
  const parsed = InputSchema.safeParse({ id: args.id });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const path = args.statePath ?? defaultStatePath();
  // 価格に触れていれば cancel より fill を優先する（先に lazy tick で解決）。
  const tick = await runTick({
    statePath: path,
    fetchCandles: args.fetchCandles,
    nowMs: args.nowMs,
    feeRate: args.feeRate,
  });
  if (!tick.success) return tick;
  const r = await loadState(path);
  if (!r.success) return r;
  if (!r.data) {
    return {
      success: false,
      error: "paper state not initialized. Run 'bitbank paper init --jpy=<amount>' first.",
    };
  }
  const target = r.data.openOrders.find((o) => o.id === parsed.data.id);
  if (!target) {
    return {
      success: false,
      error: `open order not found: ${parsed.data.id} (may have already filled)`,
    };
  }
  const updatedAt = nowIso();
  const newState: PaperState = {
    ...r.data,
    updatedAt,
    openOrders: r.data.openOrders.filter((o) => o.id !== parsed.data.id),
  };
  const w = await saveState(newState, path);
  if (!w.success) return w;
  return { success: true, data: { canceled: target } };
}
