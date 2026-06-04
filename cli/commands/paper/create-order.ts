// 100行超: paper の成行/指値発注を 1 ファイルで処理。市場 fill は ticker
// fetch + 即時 fill、指値は openOrders へ積むだけ + 残高ロック検証 + lazy
// tick で過去ギャップを解消 + pairs キャッシュからの unit_amount/最大量検証。
import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import { computeFill, makerRateResolver, resolveFeeRate } from "../../fees.js";
import type { HttpOptions } from "../../http.js";
import { type CachedPair, getPairsWithCache } from "../../pairs-cache.js";
import { type FetchCandles, type GetPairs, runTick } from "../../paper-fill.js";
import {
  availableOf,
  defaultStatePath,
  genId,
  nowIso,
  type OpenOrder,
  type PaperState,
} from "../../paper-state.js";
import { updateState } from "../../paper-state-mutate.js";
import type { Result } from "../../types.js";
import { PairSchema, PositiveDecimalSchema } from "../../validators.js";
import { ticker } from "../public/ticker.js";
import { validateOrderSize } from "./order-validate.js";

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
  refreshPairs?: boolean;
  getPairs?: GetPairs;
};

export type PaperFill = {
  id: string;
  pair: string;
  side: "buy" | "sell";
  type: "market";
  amount: number;
  fillPrice: number;
  feeQuote: number;
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
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
      exitCode: EXIT.PARAM,
    };
  }
  const pairsR = args.getPairs
    ? await args.getPairs()
    : await getPairsWithCache({ refresh: args.refreshPairs, httpOptions: opts });
  if (!pairsR.success) return pairsR;
  const v = validateOrderSize(
    parsed.data.pair,
    parsed.data.type,
    Number(parsed.data.amount),
    pairsR.data,
    parsed.data.price !== undefined ? Number(parsed.data.price) : undefined,
  );
  if (!v.success) return { ...v, exitCode: EXIT.PARAM };
  const path = args.statePath ?? defaultStatePath();
  const tick = await runTick({
    statePath: path,
    fetchCandles: args.fetchCandles,
    getPairs: args.getPairs,
    nowMs: args.nowMs,
    feeRate: args.feeRate,
  });
  if (!tick.success) return tick;
  if (parsed.data.type === "limit") {
    return placeLimit(parsed.data, args.feeRate, pairsR.data, path);
  }
  // 成行は必ず taker。サイズ検証で使った pairs から該当ペアを引き、
  // ライブ taker_fee_rate_quote を fillMarket に渡す（campaign 追従）。
  const pair = pairsR.data.find((p) => p.name === parsed.data.pair);
  return fillMarket(parsed.data, pair, args.feeRate, path, opts);
}

async function placeLimit(
  input: { pair: string; side: "buy" | "sell"; amount: string; price?: string },
  feeRateArg: number | undefined,
  pairs: CachedPair[],
  path: string,
): Promise<Result<PaperLimitPlaced>> {
  const amount = Number(input.amount);
  const price = Number(input.price);
  // 買い指値ロックは per-pair maker 基準で見積もる（override があれば最優先）。
  const fee = makerRateResolver(pairs, feeRateArg);
  const [base, quote] = input.pair.split("_");
  return updateState<PaperLimitPlaced>(
    (state) => {
      if (!state) {
        return {
          success: false,
          error: "paper state not initialized. Run 'bitbank paper init --jpy=<amount>' first.",
        };
      }
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
        if (availableOf(projected, quote, fee) < 0) {
          return { success: false, error: `insufficient ${quote} for limit buy lock` };
        }
      } else if (availableOf(projected, base, fee) < 0) {
        return { success: false, error: `insufficient ${base} for limit sell lock` };
      }
      const newState: PaperState = { ...projected, updatedAt: order.createdAt };
      return { success: true, data: { state: newState, result: { placed: order } } };
    },
    { path },
  );
}

async function fillMarket(
  input: { pair: string; side: "buy" | "sell"; amount: string },
  pair: CachedPair | undefined,
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
  const feeRate = resolveFeeRate(pair, "taker", feeRateArg);
  const [base, quote] = input.pair.split("_");
  const notional = amount * last;
  const { feeQuote, cost, proceeds } = computeFill(notional, feeRate, quote);
  return updateState<PaperFill>(
    (state) => {
      if (!state) {
        return {
          success: false,
          error: "paper state not initialized. Run 'bitbank paper init --jpy=<amount>' first.",
        };
      }
      const balances = { ...state.balances };
      if (input.side === "buy") {
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
        balances[quote] = (balances[quote] ?? 0) + proceeds;
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
        feeQuote,
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
            feeQuote,
            filledAt,
          },
        ],
      };
      return { success: true, data: { state: newState, result: fill } };
    },
    { path },
  );
}
