// 100行超: runTick に組み込んだ信用の走査を、取得の失敗・粗い足・pairs の取り直し・現物の売りによる追証解消まで通しで検査する
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Candle } from "../../../commands/public/candles-fetch.js";
import type { CachedPair } from "../../../pairs-cache.js";
import { type FetchCandles, runTick } from "../../../paper-fill.js";
import { emptyMarginState, type MarginPosition } from "../../../paper-margin/state.js";
import { loadState, type PaperState, saveState } from "../../../paper-state.js";
import type { Result } from "../../../types.js";
import { MOCK_PAIRS } from "../../test-helpers.js";

const P = Date.parse;
const MIN = 60_000;
const LAST_TICK = "2026-11-02T00:00:00.000Z"; // 09:00 JST
const NOW = P(LAST_TICK) + 10 * MIN;

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
  margin_next_individual_ratio: null,
  margin_next_individual_until: null,
  stop_margin_long_order: false,
  stop_margin_short_order: false,
};

let dir: string;
let statePath: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "paper-margin-tick-"));
  statePath = join(dir, "paper-state.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function position(over: Partial<MarginPosition> = {}): MarginPosition {
  return {
    pair: "btc_jpy",
    positionSide: "long",
    openAmount: 0.1,
    product: 1_000_000,
    unrealizedFee: 0,
    unrealizedInterest: 0,
    openedAt: LAST_TICK,
    lastInterestAt: LAST_TICK,
    ...over,
  };
}

async function seed(over: Partial<PaperState> = {}, margin: Partial<PaperState["margin"]> = {}) {
  const state: PaperState = {
    version: 4,
    createdAt: LAST_TICK,
    updatedAt: LAST_TICK,
    initialJpy: 1_000_000,
    balances: { jpy: 1_000_000 },
    history: [],
    lastTickAt: LAST_TICK,
    openOrders: [],
    margin: { ...emptyMarginState(LAST_TICK), positions: [position()], ...margin },
    ...over,
  };
  await saveState(state, statePath);
}

function candles(list: Array<[number, number, number]>): FetchCandles & { calls: number } {
  const f = (async (_pair: string, from: number, to: number): Promise<Result<Candle[]>> => {
    f.calls++;
    const data = list
      .map(([ts, low, high]) => ({ timestamp: ts, open: high, high, low, close: low, vol: 1 }))
      .filter((c) => c.timestamp >= from && c.timestamp <= to);
    return { success: true, data };
  }) as FetchCandles & { calls: number };
  f.calls = 0;
  return f;
}

function pairsOf(...lists: CachedPair[][]) {
  let i = 0;
  const f = async (): Promise<Result<CachedPair[]>> => ({
    success: true,
    data: lists[Math.min(i++, lists.length - 1)],
  });
  return Object.assign(f, { count: () => i });
}

async function load(): Promise<PaperState> {
  const r = await loadState(statePath);
  if (!r.success || !r.data) throw new Error("load failed");
  return r.data;
}

describe("runTick with a margin book", () => {
  it("a spot-only account fetches nothing for margin and reports no margin section", async () => {
    await seed({}, { positions: [] });
    const getPairs = pairsOf([BTC]);
    const r = await runTick({ statePath, nowMs: NOW, fetchCandles: candles([]), getPairs });
    expect(r.success && r.data.margin).toBe(undefined);
    expect(getPairs.count()).toBe(0);
  });

  it("force-closes on a crash candle, records a losscut history row and advances lastTickAt", async () => {
    await seed();
    const r = await runTick({
      statePath,
      nowMs: NOW,
      fetchCandles: candles([[P(LAST_TICK) + MIN, 2_000_000, 1e7]]),
      getPairs: pairsOf([BTC]),
    });
    if (!r.success) throw new Error(r.error);
    expect(r.data.margin?.events).toEqual([
      {
        kind: "losscut",
        at: new Date(P(LAST_TICK) + MIN).toISOString(),
        reason: "below-losscut",
        canceled: [],
      },
    ]);
    const s = await load();
    expect(s.margin.positions).toEqual([]);
    expect(s.margin.history).toHaveLength(1);
    expect(s.margin.history[0]).toMatchObject({
      type: "losscut",
      side: "sell",
      fillPrice: 2_000_000,
      feeOccurred: 200,
    });
    expect(s.balances.jpy).toBeCloseTo(1_000_000 - 800_000 - 200, 4);
    expect(s.lastTickAt).toBe(new Date(NOW).toISOString());
  });

  it("fills a margin limit open and records it", async () => {
    const order = {
      id: "m1",
      pair: "btc_jpy",
      side: "buy" as const,
      positionSide: "long" as const,
      type: "limit" as const,
      price: 9_900_000,
      amount: 0.01,
      createdAt: LAST_TICK,
    };
    await seed({}, { positions: [], orders: [order] });
    const r = await runTick({
      statePath,
      nowMs: NOW,
      fetchCandles: candles([[P(LAST_TICK) + MIN, 9_800_000, 1e7]]),
      getPairs: pairsOf([BTC]),
    });
    if (!r.success) throw new Error(r.error);
    const s = await load();
    expect(s.margin.orders).toEqual([]);
    expect(s.margin.positions[0]).toMatchObject({ openAmount: 0.01, product: 99_000 });
    expect(s.margin.history[0]).toMatchObject({
      id: "m1",
      type: "limit",
      feeOccurred: 0,
      feeCharged: 0,
    });
  });

  it("charges interest across a JST midnight even with no orders at all", async () => {
    await seed();
    const now = P("2026-11-02T15:30:00Z"); // 00:30 JST 翌日
    const r = await runTick({
      statePath,
      nowMs: now,
      fetchCandles: candles([[now - MIN, 1e7, 1e7]]),
      getPairs: pairsOf([BTC]),
    });
    if (!r.success) throw new Error(r.error);
    expect((await load()).margin.positions[0].unrealizedInterest).toBeCloseTo(400, 10);
  });

  it("uses 4hour candles for a gap over 24h and says it is approximate", async () => {
    await seed();
    const now = P(LAST_TICK) + 3 * 86_400_000;
    const fine = candles([]);
    const coarse = candles([[P(LAST_TICK) + 8 * 3600_000, 1e7, 1e7]]);
    const r = await runTick({
      statePath,
      nowMs: now,
      fetchCandles: fine,
      fetchCoarseCandles: coarse,
      getPairs: pairsOf([BTC]),
    });
    if (!r.success) throw new Error(r.error);
    expect(coarse.calls).toBe(1);
    expect(fine.calls).toBe(0);
    expect(r.data.margin?.approximate).toBe(true);
    expect(r.data.warnings.some((w) => w.includes("4hour candles (approximate)"))).toBe(true);
  });

  it("does not advance the margin scan or touch margin when the candles cannot be fetched", async () => {
    await seed();
    const failing: FetchCandles = async () => ({ success: false, error: "boom" });
    const r = await runTick({
      statePath,
      nowMs: NOW,
      fetchCandles: failing,
      getPairs: pairsOf([BTC]),
    });
    if (!r.success) throw new Error(r.error);
    expect(
      r.data.warnings.some((w) => w.includes("margin: fetch candles for btc_jpy failed")),
    ).toBe(true);
    const s = await load();
    expect(s.margin.positions).toHaveLength(1);
    // 現物の lastTickAt（現物に指値が無いので進む）とは別に、信用の走査済み時刻は止まる
    expect(s.lastTickAt).toBe(new Date(NOW).toISOString());
    expect(s.margin.lastScanAt).toBe(LAST_TICK);
  });

  it("does not advance the margin scan when pairs carry no margin parameters (and no last-known copy)", async () => {
    await seed();
    const r = await runTick({
      statePath,
      nowMs: NOW,
      fetchCandles: candles([[P(LAST_TICK) + MIN, 1e7, 1e7]]),
      getPairs: pairsOf(MOCK_PAIRS),
    });
    if (!r.success) throw new Error(r.error);
    expect((await load()).margin.lastScanAt).toBe(LAST_TICK);
    expect(r.data.warnings.some((w) => w.includes("no margin params for btc_jpy"))).toBe(true);
  });

  it("refreshes pairs once when the risk ratio is past its until", async () => {
    await seed();
    const stale = { ...BTC, margin_current_individual_until: P(LAST_TICK) - 1 };
    const getPairs = pairsOf([stale], [BTC]);
    const r = await runTick({
      statePath,
      nowMs: NOW,
      fetchCandles: candles([[P(LAST_TICK) + MIN, 1e7, 1e7]]),
      getPairs,
    });
    if (!r.success) throw new Error(r.error);
    expect(getPairs.count()).toBe(2);
    expect(r.data.lastTickAt).toBe(new Date(NOW).toISOString());
  });

  it("skips margin for a --pair tick and does not advance lastTickAt", async () => {
    await seed();
    const r = await runTick({
      statePath,
      nowMs: NOW,
      pair: "btc_jpy",
      fetchCandles: candles([]),
      getPairs: pairsOf([BTC]),
    });
    if (!r.success) throw new Error(r.error);
    expect(r.data.warnings.some((w) => w.includes("margin: skipped for --pair"))).toBe(true);
    expect(r.data.lastTickAt).toBe(LAST_TICK);
    expect((await load()).margin.lastScanAt).toBe(LAST_TICK);
  });

  it("a spot sell filled in the tick resolves a margin call when B ≥ Mm at the end", async () => {
    // JPY 400,000・ロング 0.1 @ 10,000,000・価格 9,900,000 → B 390,000 < Mm 500,000（追証中）。
    // 現物 0.02 BTC を 9,900,000 で売る指値が約定すると JPY が 198,000 増え、B ≥ Mm になる
    const call = { judgedAt: LAST_TICK, deadline: "2026-11-03T00:00:00.000Z", amount: 110_000 };
    const spotSell = {
      id: "s1",
      pair: "btc_jpy",
      side: "sell" as const,
      type: "limit" as const,
      price: 9_900_000,
      amount: 0.02,
      createdAt: LAST_TICK,
    };
    await seed({ balances: { jpy: 400_000, btc: 0.02 }, openOrders: [spotSell] }, { call });
    const r = await runTick({
      statePath,
      nowMs: NOW,
      fetchCandles: candles([[P(LAST_TICK) + MIN, 9_900_000, 9_900_000]]),
      getPairs: pairsOf([BTC]),
    });
    if (!r.success) throw new Error(r.error);
    expect(r.data.filled.map((f) => f.id)).toEqual(["s1"]);
    expect(r.data.margin?.events.map((e) => e.kind)).toEqual(["margin-call-resolved"]);
    expect((await load()).margin.call).toBe(null);
  });
});
