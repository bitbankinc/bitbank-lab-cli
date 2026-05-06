// 100行超: paper の成行/指値発注を 1 ファイルで処理。市場 fill は ticker
// fetch + 即時 fill、指値は openOrders へ積むだけ + 残高ロック検証 + lazy
// tick で過去ギャップを解消。
import { z } from "zod";
import type { HttpOptions } from "../../http.js";
import { type FetchCandles, runTick } from "../../paper-fill.js";
import {
  DEFAULT_TAKER_FEE_RATE,
  type OpenOrder,
  type PaperState,
  availableOf,
  defaultStatePath,
  genId,
  loadState,
  nowIso,
  saveState,
} from "../../paper-state.js";
import type { Result } from "../../types.js";
import { PairSchema, PositiveDecimalSchema } from "../../validators.js";
import { ticker } from "../public/ticker.js";

const InputSchema = z
  .object({
    pair: PairSchema,
    side: z.enum(["buy", "sell"]),
    type: z.enum(["market", "limit"]),
    amount: PositiveDecimalSchema,
    price: PositiveDecimalSchema.optional(),
  })
  .refine((v) => v.type !== "limit" || v.price !== undefined, {
    message: "--price is required for limit orders",
  });

export type PaperCreateOrderArgs = {
  pair?: string;
  side?: string;
  type?: string;
  amount?: string;
  price?: string;
  feeRate?: number;
  statePath?: string;
  fetchCandles?: FetchCandles;
  nowMs?: number;
};

export type PaperFill = {
  id: string;
  pair: string;
  side: "buy" | "sell";
  type: "market";
  amount: number;
  fillPrice: number;
  feeJpy: number;
  filledAt: string;
  balances: Record<string, number>;
};

export type PaperLimitPlaced = { placed: OpenOrder };

export async function paperCreateOrder(
  args: PaperCreateOrderArgs,
  opts?: HttpOptions,
): Promise<Result<PaperFill | PaperLimitPlaced>> {
  const parsed = InputSchema.safeParse({
    pair: args.pair,
    side: args.side,
    type: args.type,
    amount: args.amount,
    price: args.price,
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const path = args.statePath ?? defaultStatePath();
  const tick = await runTick({
    statePath: path,
    fetchCandles: args.fetchCandles,
    nowMs: args.nowMs,
    feeRate: args.feeRate,
  });
  if (!tick.success) return tick;
  const sr = await loadState(path);
  if (!sr.success) return sr;
  if (!sr.data) {
    return {
      success: false,
      error: "paper state not initialized. Run 'bitbank paper init --jpy=<amount>' first.",
    };
  }
  if (parsed.data.type === "limit") {
    return placeLimit(sr.data, parsed.data, args.feeRate, path);
  }
  return fillMarket(sr.data, parsed.data, args.feeRate, path, opts);
}

async function placeLimit(
  state: PaperState,
  input: { pair: string; side: "buy" | "sell"; amount: string; price?: string },
  feeRateArg: number | undefined,
  path: string,
): Promise<Result<PaperLimitPlaced>> {
  const amount = Number(input.amount);
  const price = Number(input.price);
  const feeRate = feeRateArg ?? DEFAULT_TAKER_FEE_RATE;
  const [base, quote] = input.pair.split("_");
  const order: OpenOrder = {
    id: genId(),
    pair: input.pair,
    side: input.side,
    type: "limit",
    price,
    amount,
    createdAt: nowIso(),
  };
  const projected: PaperState = { ...state, openOrders: [...state.openOrders, order] };
  if (input.side === "buy") {
    if (availableOf(projected, quote, feeRate) < 0) {
      return { success: false, error: `insufficient ${quote} for limit buy lock` };
    }
  } else if (availableOf(projected, base, feeRate) < 0) {
    return { success: false, error: `insufficient ${base} for limit sell lock` };
  }
  const newState: PaperState = { ...projected, updatedAt: order.createdAt };
  const w = await saveState(newState, path);
  if (!w.success) return w;
  return { success: true, data: { placed: order } };
}

async function fillMarket(
  state: PaperState,
  input: { pair: string; side: "buy" | "sell"; amount: string },
  feeRateArg: number | undefined,
  path: string,
  opts?: HttpOptions,
): Promise<Result<PaperFill>> {
  const t = await ticker({ pair: input.pair }, opts);
  if (!t.success) return t;
  if (!t.data.last) return { success: false, error: "ticker has no last price" };
  const last = Number(t.data.last);
  if (!Number.isFinite(last) || last <= 0) {
    return { success: false, error: "ticker last price is not a positive finite number" };
  }
  const amount = Number(input.amount);
  const feeRate = feeRateArg ?? DEFAULT_TAKER_FEE_RATE;
  const [base, quote] = input.pair.split("_");
  const notional = amount * last;
  const feeJpy = notional * feeRate;
  const balances = { ...state.balances };
  if (input.side === "buy") {
    const cost = notional + feeJpy;
    const avail = availableOf(state, quote, feeRate);
    if (avail < cost) {
      return { success: false, error: `insufficient ${quote}: need ${cost}, have ${avail}` };
    }
    balances[quote] = (balances[quote] ?? 0) - cost;
    balances[base] = (balances[base] ?? 0) + amount;
  } else {
    const avail = availableOf(state, base, feeRate);
    if (avail < amount) {
      return { success: false, error: `insufficient ${base}: need ${amount}, have ${avail}` };
    }
    balances[base] = (balances[base] ?? 0) - amount;
    balances[quote] = (balances[quote] ?? 0) + (notional - feeJpy);
  }
  const filledAt = nowIso();
  const id = genId();
  const fill: PaperFill = {
    id,
    pair: input.pair,
    side: input.side,
    type: "market",
    amount,
    fillPrice: last,
    feeJpy,
    filledAt,
    balances,
  };
  const newState: PaperState = {
    ...state,
    updatedAt: filledAt,
    balances,
    history: [
      ...state.history,
      {
        id,
        pair: input.pair,
        side: input.side,
        type: "market",
        amount,
        fillPrice: last,
        feeJpy,
        filledAt,
      },
    ],
  };
  const w = await saveState(newState, path);
  if (!w.success) return w;
  return { success: true, data: fill };
}
