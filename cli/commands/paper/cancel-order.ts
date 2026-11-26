// 現物の指値（openOrders）を id で探し、無ければ信用の指値（margin.orders。ADR-010）を探して取り消す。
// 信用の返済注文が予約していた数量（locked_amount）と新規建て注文の約定時必要保証金は state に持たず
// 毎回導いているので（paper-margin/closable.ts・account.ts）、注文を消すだけで解放される。
import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import { type FetchCandles, type GetPairs, runTick } from "../../paper-fill.js";
import type { MarginOrder } from "../../paper-margin/state.js";
import { withStatePath } from "../../paper-result.js";
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

type Canceled = { canceled: OpenOrder | MarginOrder };

export async function paperCancelOrder(args: PaperCancelOrderArgs): Promise<Result<Canceled>> {
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
  const r = await updateState<Canceled>(
    (state) => {
      if (!state) {
        return {
          success: false,
          error: "paper state not initialized. Run 'bitbank paper init --jpy=<amount>' first.",
        };
      }
      const id = parsed.data.id;
      const updatedAt = nowIso();
      const spot = state.openOrders.find((o) => o.id === id);
      if (spot) {
        const openOrders = state.openOrders.filter((o) => o.id !== id);
        const newState: PaperState = { ...state, updatedAt, openOrders };
        return { success: true, data: { state: newState, result: { canceled: spot } } };
      }
      const margin = state.margin.orders.find((o) => o.id === id);
      if (margin) {
        const orders = state.margin.orders.filter((o) => o.id !== id);
        const newState: PaperState = { ...state, updatedAt, margin: { ...state.margin, orders } };
        return { success: true, data: { state: newState, result: { canceled: margin } } };
      }
      return {
        success: false,
        error: `open order not found: ${id} (may have already filled)`,
      };
    },
    { path },
  );
  return withStatePath(r, path);
}
