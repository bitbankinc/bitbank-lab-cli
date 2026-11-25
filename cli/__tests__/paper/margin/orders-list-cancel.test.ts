import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { paperActiveOrders } from "../../../commands/paper/active-orders.js";
import { paperCancelOrder } from "../../../commands/paper/cancel-order.js";
import type { Candle } from "../../../commands/public/candles-fetch.js";
import type { CachedPair } from "../../../pairs-cache.js";
import type { FetchCandles } from "../../../paper-fill.js";
import { checkClosable } from "../../../paper-margin/closable.js";
import { emptyMarginState, type MarginOrder } from "../../../paper-margin/state.js";
import { loadState, type OpenOrder, type PaperState, saveState } from "../../../paper-state.js";
import { MOCK_PAIRS } from "../../test-helpers.js";

const T0 = Date.parse("2026-11-02T00:00:00Z");
const MIN = 60_000;
const iso = (t: number) => new Date(t).toISOString();

const BTC: CachedPair = {
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
  stop_margin_long_order: false,
  stop_margin_short_order: false,
};
const getPairs = async () => ({ success: true as const, data: [BTC] });

const SPOT: OpenOrder = {
  id: "spot1",
  pair: "btc_jpy",
  side: "buy",
  type: "limit",
  price: 9_000_000,
  amount: 0.01,
  createdAt: iso(T0 + MIN),
};
const OPEN: MarginOrder = {
  id: "mopen",
  pair: "btc_jpy",
  side: "buy",
  positionSide: "long",
  type: "limit",
  price: 9_900_000,
  amount: 0.01,
  createdAt: iso(T0),
};
const CLOSE: MarginOrder = {
  id: "mclose",
  pair: "btc_jpy",
  side: "sell",
  positionSide: "long",
  type: "limit",
  price: 12_000_000,
  amount: 0.05,
  createdAt: iso(T0 + 2 * MIN),
};

let dir: string;
let statePath: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "paper-margin-orders-"));
  statePath = join(dir, "paper-state.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function seed(openOrders: OpenOrder[], orders: MarginOrder[]) {
  const state: PaperState = {
    version: 4,
    createdAt: iso(T0),
    updatedAt: iso(T0),
    initialJpy: 1_000_000,
    balances: { jpy: 1_000_000 },
    history: [],
    lastTickAt: iso(T0),
    openOrders,
    margin: {
      ...emptyMarginState(iso(T0)),
      positions: [
        {
          pair: "btc_jpy",
          positionSide: "long",
          openAmount: 0.05,
          product: 500_000,
          unrealizedFee: 0,
          unrealizedInterest: 0,
          openedAt: iso(T0),
          lastInterestAt: iso(T0),
        },
      ],
      orders,
    },
  };
  await saveState(state, statePath);
}

/** 1 本だけの足（low〜high） */
function candle(low: number, high: number): FetchCandles {
  return async (_p, from, to) => {
    const c: Candle = { timestamp: T0 + 3 * MIN, open: high, high, low, close: low, vol: 1 };
    return { success: true, data: c.timestamp >= from && c.timestamp <= to ? [c] : [] };
  };
}

const quiet = { getPairs, fetchCandles: candle(1e7, 1e7), nowMs: T0 + 5 * MIN };

describe("paper active-orders with margin orders", () => {
  it("lists spot and margin orders together in creation order; only margin orders carry positionSide", async () => {
    await seed([SPOT], [OPEN, CLOSE]);
    const r = await paperActiveOrders({ statePath, ...quiet });
    if (!r.success) throw new Error(r.error);
    expect(r.data.map((o) => o.id)).toEqual(["mopen", "spot1", "mclose"]);
    const json = JSON.parse(JSON.stringify(r.data));
    expect(json[1]).not.toHaveProperty("positionSide");
    expect(json[0].positionSide).toBe("long");
    // 表の列は先頭行のキーで決まるので、混在時は現物の行にもキー（値は undefined）を持たせる
    expect("positionSide" in r.data[1]).toBe(true);
  });

  it("leaves a spot-only list exactly as before (no positionSide key)", async () => {
    await seed([SPOT], []);
    const r = await paperActiveOrders({ statePath, ...quiet });
    if (!r.success) throw new Error(r.error);
    expect(r.data).toEqual([SPOT]);
    expect("positionSide" in r.data[0]).toBe(false);
  });
});

describe("paper cancel-order with margin orders", () => {
  it("cancels a margin close order, which frees its reserved amount", async () => {
    await seed([SPOT], [OPEN, CLOSE]);
    const r = await paperCancelOrder({ id: "mclose", statePath, ...quiet });
    if (!r.success) throw new Error(r.error);
    expect(r.data.canceled).toEqual(CLOSE);
    const s = await loadState(statePath);
    if (!s.success || !s.data) throw new Error("load");
    expect(s.data.margin.orders.map((o) => o.id)).toEqual(["mopen"]);
    expect(s.data.openOrders).toEqual([SPOT]);
    const closable = checkClosable(s.data.margin.positions, s.data.margin.orders, {
      pair: "btc_jpy",
      positionSide: "long",
      amount: 0.05,
    });
    expect(closable).toEqual({ success: true, data: { closable: 0.05 } });
  });

  it("still cancels spot orders", async () => {
    await seed([SPOT], [OPEN]);
    const r = await paperCancelOrder({ id: "spot1", statePath, ...quiet });
    expect(r.success && r.data.canceled.id).toBe("spot1");
  });

  it("a margin order the lazy tick fills first is reported as already filled, not canceled", async () => {
    await seed([], [OPEN]);
    const r = await paperCancelOrder({
      id: "mopen",
      statePath,
      getPairs,
      fetchCandles: candle(9_800_000, 1e7),
      nowMs: T0 + 5 * MIN,
    });
    expect(!r.success && r.error).toContain(
      "open order not found: mopen (may have already filled)",
    );
    const s = await loadState(statePath);
    expect(s.success && s.data?.margin.positions[0].openAmount).toBeCloseTo(0.06, 12);
  });
});
