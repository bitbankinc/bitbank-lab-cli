// 信用（ADR-010）のテストの共通の材料: 信用対応の btc_jpy、state の種、足・pairs・ticker のモック。
import type { Candle } from "../../../commands/public/candles-fetch.js";
import type { CachedPair } from "../../../pairs-cache.js";
import type { FetchCandles } from "../../../paper-fill.js";
import { emptyMarginState, type MarginPosition } from "../../../paper-margin/state.js";
import { type PaperState, saveState } from "../../../paper-state.js";
import type { Result } from "../../../types.js";
import { MOCK_PAIRS } from "../../test-helpers.js";

export const MIN = 60_000;

export const BTC: CachedPair = {
  ...MOCK_PAIRS[0],
  maker_fee_rate_quote: 0,
  margin_open_maker_fee_rate_quote: 0,
  margin_open_taker_fee_rate_quote: 0.001,
  margin_close_maker_fee_rate_quote: 0,
  margin_close_taker_fee_rate_quote: 0.001,
  margin_long_interest: 0.0004,
  margin_short_interest: 0.0004,
  margin_current_individual_ratio: 0.5,
  margin_current_individual_until: 253402300799999,
  margin_next_individual_ratio: null,
  margin_next_individual_until: null,
  stop_margin_long_order: false,
  stop_margin_short_order: false,
};

export const pairsOf =
  (...list: CachedPair[]) =>
  async (): Promise<Result<CachedPair[]>> => ({
    success: true,
    data: list,
  });

export function longPosition(at: string, over: Partial<MarginPosition> = {}): MarginPosition {
  return {
    pair: "btc_jpy",
    positionSide: "long",
    openAmount: 0.1,
    product: 1_000_000,
    unrealizedFee: 0,
    unrealizedInterest: 0,
    openedAt: at,
    lastInterestAt: at,
    ...over,
  };
}

export function stateAt(
  at: string,
  over: Partial<PaperState> = {},
  margin: Partial<PaperState["margin"]> = {},
): PaperState {
  return {
    version: 4,
    createdAt: at,
    updatedAt: at,
    initialJpy: 1_000_000,
    balances: { jpy: 1_000_000 },
    history: [],
    lastTickAt: at,
    openOrders: [],
    margin: { ...emptyMarginState(at), ...margin },
    ...over,
  };
}

export async function seedState(path: string, state: PaperState): Promise<void> {
  const r = await saveState(state, path);
  if (!r.success) throw new Error(r.error);
}

/** [時刻, 安値, 高値] の 1min 足。窓（from〜to）の中だけ返す。fail に含むペアは取得失敗にする */
export function candlesOf(
  list: Array<[number, number, number]>,
  fail: readonly string[] = [],
): FetchCandles {
  return async (pair, from, to) => {
    if (fail.includes(pair)) return { success: false, error: `no candles for ${pair}` };
    const data = list
      .map(
        ([timestamp, low, high]): Candle => ({
          timestamp,
          open: high,
          high,
          low,
          close: low,
          vol: 1,
        }),
      )
      .filter((c) => c.timestamp >= from && c.timestamp <= to);
    return { success: true, data };
  };
}

/** どのペアにも last を返す ticker（HttpOptions に渡す） */
export function tickerAt(last: number): { fetch: typeof fetch; retries: number } {
  const l = String(last);
  const data = { sell: l, buy: l, high: l, low: l, open: l, last: l, vol: "1", timestamp: 1 };
  return {
    fetch: async () => new Response(JSON.stringify({ success: 1, data })),
    retries: 0,
  };
}
