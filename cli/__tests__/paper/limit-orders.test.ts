// 100行超: 指値の lazy fill / lock を網羅
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { paperActiveOrders } from "../../commands/paper/active-orders.js";
import { paperAssets } from "../../commands/paper/assets.js";
import { paperCancelOrder } from "../../commands/paper/cancel-order.js";
import { paperCreateOrder } from "../../commands/paper/create-order.js";
import { paperInit } from "../../commands/paper/init.js";
import { paperTick } from "../../commands/paper/tick.js";
import { paperTradeHistory } from "../../commands/paper/trade-history.js";
import type { FetchCandles } from "../../paper-fill.js";
import { loadState } from "../../paper-state.js";
import { mockFetchData, mockGetPairs, mockGetPairsWith } from "../test-helpers.js";

let dir: string;
let statePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "paper-limit-"));
  statePath = join(dir, "paper-state.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const noCandles: FetchCandles = async () => ({ success: true, data: [] });

function candle(ts: number, open: number, high: number, low: number, close: number) {
  return { open, high, low, close, vol: 0, timestamp: ts };
}

// 成行シード（売りリベート検証で btc を仕込む）用の ticker mock。
const tickerFetch = (last: string) =>
  mockFetchData({
    sell: last,
    buy: last,
    high: last,
    low: last,
    open: last,
    last,
    vol: "1",
    timestamp: 0,
  });

describe("paper state v1 → v3 migration", () => {
  it("loads a v1 state file and returns v3 in memory", async () => {
    const v1 = {
      version: 1,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
      initialJpy: 1000000,
      balances: { jpy: 1000000 },
      history: [],
    };
    writeFileSync(statePath, JSON.stringify(v1));
    const r = await loadState(statePath);
    expect(r.success).toBe(true);
    if (!r.success || !r.data) return;
    expect(r.data.version).toBe(3);
    expect(r.data.lastTickAt).toBe("2024-01-02T00:00:00.000Z");
    expect(r.data.openOrders).toEqual([]);
  });
});

describe("paper limit create / active / cancel", () => {
  it("places a limit buy and shows it in active-orders", async () => {
    await paperInit({ jpy: "10000000", statePath });
    const r = await paperCreateOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.001",
      feeRate: 0,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    expect(r.success).toBe(true);
    const ao = await paperActiveOrders({ statePath, fetchCandles: noCandles });
    expect(ao.success).toBe(true);
    if (!ao.success) return;
    expect(ao.data).toHaveLength(1);
    expect(ao.data[0].side).toBe("buy");
    expect(ao.data[0].price).toBe(5000000);
  });

  it("rejects limit buy when locked > available", async () => {
    await paperInit({ jpy: "1000", statePath });
    const r = await paperCreateOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.001",
      feeRate: 0,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("insufficient");
  });

  it("cancel-order removes the order and unlocks balance", async () => {
    await paperInit({ jpy: "10000000", statePath });
    const placed = await paperCreateOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.001",
      feeRate: 0,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    if (!placed.success || !("placed" in placed.data)) throw new Error("expected placed");
    const id = placed.data.placed.id;
    const before = await paperAssets({ statePath, fetchCandles: noCandles, feeRate: 0 });
    if (!before.success) return;
    expect(before.data.find((r) => r.asset === "jpy")?.locked).toBe(5000);
    const c = await paperCancelOrder({ id, statePath, fetchCandles: noCandles });
    expect(c.success).toBe(true);
    const after = await paperAssets({ statePath, fetchCandles: noCandles, feeRate: 0 });
    if (!after.success) return;
    expect(after.data.find((r) => r.asset === "jpy")?.locked).toBe(0);
    expect(after.data.find((r) => r.asset === "jpy")?.available).toBe(10000000);
  });

  it("cancel-order returns Err for unknown id", async () => {
    await paperInit({ jpy: "1000000", statePath });
    const r = await paperCancelOrder({ id: "nope", statePath });
    expect(r.success).toBe(false);
  });
});

describe("paper assets shows available / locked / total", () => {
  it("locked = price*amount + fee for limit buy", async () => {
    await paperInit({ jpy: "1000000", statePath });
    await paperCreateOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "100000",
      amount: "1",
      feeRate: 0.001,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    const a = await paperAssets({ statePath, fetchCandles: noCandles, feeRate: 0.001 });
    expect(a.success).toBe(true);
    if (!a.success) return;
    const jpy = a.data.find((r) => r.asset === "jpy");
    expect(jpy?.total).toBe(1000000);
    expect(jpy?.locked).toBeCloseTo(100100, 6);
    expect(jpy?.available).toBeCloseTo(899900, 6);
  });
});

describe("paper tick fill resolution", () => {
  it("buy fills at exact limit price when candle.low <= price", async () => {
    await paperInit({ jpy: "10000000", statePath });
    await paperCreateOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.001",
      feeRate: 0,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    const sBefore = await loadState(statePath);
    if (!sBefore.success || !sBefore.data) throw new Error("state missing");
    const orderTs = Date.parse(sBefore.data.openOrders[0].createdAt);
    const fc: FetchCandles = async () => ({
      success: true,
      data: [candle(orderTs + 60_000, 5_100_000, 5_100_000, 4_999_000, 5_050_000)],
    });
    const t = await paperTick({
      statePath,
      fetchCandles: fc,
      getPairs: mockGetPairs,
      nowMs: orderTs + 120_000,
      feeRate: 0,
    });
    expect(t.success).toBe(true);
    if (!t.success) return;
    expect(t.data.filled).toHaveLength(1);
    expect(t.data.filled[0].fillPrice).toBe(5000000);
    const after = await loadState(statePath);
    if (!after.success || !after.data) return;
    expect(after.data.openOrders).toHaveLength(0);
    expect(after.data.balances.btc).toBeCloseTo(0.001, 10);
    expect(after.data.balances.jpy).toBeCloseTo(10000000 - 5000, 6);
  });

  it("sell fills when candle.high >= price", async () => {
    await paperInit({ jpy: "10000000", statePath });
    await paperCreateOrder(
      {
        pair: "btc_jpy",
        side: "buy",
        type: "market",
        amount: "0.01",
        feeRate: 0,
        statePath,
        getPairs: mockGetPairs,
      },
      {
        fetch: async () =>
          new Response(
            JSON.stringify({
              success: 1,
              data: {
                last: "5000000",
                sell: "5000000",
                buy: "5000000",
                high: "5000000",
                low: "5000000",
                open: "5000000",
                vol: "1",
                timestamp: 0,
              },
            }),
          ),
        retries: 0,
      },
    );
    await paperCreateOrder({
      pair: "btc_jpy",
      side: "sell",
      type: "limit",
      price: "6000000",
      amount: "0.005",
      feeRate: 0,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    const s = await loadState(statePath);
    if (!s.success || !s.data) throw new Error("state missing");
    const orderTs = Date.parse(s.data.openOrders[0].createdAt);
    const fc: FetchCandles = async () => ({
      success: true,
      data: [candle(orderTs + 60_000, 5_500_000, 6_100_000, 5_500_000, 6_050_000)],
    });
    const t = await paperTick({
      statePath,
      fetchCandles: fc,
      getPairs: mockGetPairs,
      nowMs: orderTs + 120_000,
      feeRate: 0,
    });
    expect(t.success).toBe(true);
    if (!t.success) return;
    expect(t.data.filled[0].fillPrice).toBe(6000000);
  });

  it("does not fill when limit is never touched", async () => {
    await paperInit({ jpy: "10000000", statePath });
    await paperCreateOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "1000000",
      amount: "0.001",
      feeRate: 0,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    const s = await loadState(statePath);
    if (!s.success || !s.data) return;
    const orderTs = Date.parse(s.data.openOrders[0].createdAt);
    const fc: FetchCandles = async () => ({
      success: true,
      data: [candle(orderTs + 60_000, 5_000_000, 5_500_000, 4_500_000, 5_100_000)],
    });
    const t = await paperTick({
      statePath,
      fetchCandles: fc,
      getPairs: mockGetPairs,
      nowMs: orderTs + 120_000,
    });
    if (!t.success) return;
    expect(t.data.filled).toHaveLength(0);
  });

  it("does not fill on candles before order createdAt (no retroactive fill)", async () => {
    await paperInit({ jpy: "10000000", statePath });
    // Force lastTickAt back in time so the window covers older candles.
    {
      const raw = JSON.parse(readFileSync(statePath, "utf-8"));
      raw.lastTickAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      writeFileSync(statePath, JSON.stringify(raw));
    }
    await paperCreateOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.001",
      feeRate: 0,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    const s = await loadState(statePath);
    if (!s.success || !s.data) return;
    const orderTs = Date.parse(s.data.openOrders[0].createdAt);
    // Candle BEFORE the order was created. Even though price would hit, no fill.
    const fc: FetchCandles = async () => ({
      success: true,
      data: [candle(orderTs - 60_000, 5_000_000, 5_000_000, 4_000_000, 4_500_000)],
    });
    const t = await paperTick({
      statePath,
      fetchCandles: fc,
      getPairs: mockGetPairs,
      nowMs: orderTs + 120_000,
    });
    if (!t.success) return;
    expect(t.data.filled).toHaveLength(0);
  });

  it("resolves multiple pairs / orders independently", async () => {
    await paperInit({ jpy: "100000000", statePath });
    await paperCreateOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.001",
      feeRate: 0,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    await paperCreateOrder({
      pair: "eth_jpy",
      side: "buy",
      type: "limit",
      price: "300000",
      amount: "0.01",
      feeRate: 0,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    const s = await loadState(statePath);
    if (!s.success || !s.data) return;
    const tsBtc = Date.parse(
      (s.data.openOrders.find((o) => o.pair === "btc_jpy") ?? s.data.openOrders[0]).createdAt,
    );
    const tsEth = Date.parse(
      (s.data.openOrders.find((o) => o.pair === "eth_jpy") ?? s.data.openOrders[0]).createdAt,
    );
    const fc: FetchCandles = async (pair) => {
      if (pair === "btc_jpy") {
        return {
          success: true,
          data: [candle(tsBtc + 60_000, 5_000_000, 5_100_000, 4_900_000, 5_050_000)],
        };
      }
      return {
        success: true,
        data: [candle(tsEth + 60_000, 350_000, 360_000, 290_000, 320_000)],
      };
    };
    const t = await paperTick({
      statePath,
      fetchCandles: fc,
      getPairs: mockGetPairs,
      nowMs: Math.max(tsBtc, tsEth) + 120_000,
      feeRate: 0,
    });
    if (!t.success) return;
    expect(t.data.filled).toHaveLength(2);
  });
});

describe("paper lazy tick", () => {
  it("paper assets triggers tick and fills outstanding limit orders", async () => {
    await paperInit({ jpy: "10000000", statePath });
    await paperCreateOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.001",
      feeRate: 0,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    const s = await loadState(statePath);
    if (!s.success || !s.data) return;
    const orderTs = Date.parse(s.data.openOrders[0].createdAt);
    const fc: FetchCandles = async () => ({
      success: true,
      data: [candle(orderTs + 60_000, 5_000_000, 5_000_000, 4_900_000, 4_950_000)],
    });
    const a = await paperAssets({
      statePath,
      fetchCandles: fc,
      getPairs: mockGetPairs,
      nowMs: orderTs + 120_000,
      feeRate: 0,
    });
    if (!a.success) return;
    const btc = a.data.find((r) => r.asset === "btc");
    expect(btc?.total).toBeCloseTo(0.001, 10);
    const ao = await paperActiveOrders({ statePath, fetchCandles: noCandles });
    if (!ao.success) return;
    expect(ao.data).toHaveLength(0);
  });

  it("paper trade-history triggers tick", async () => {
    await paperInit({ jpy: "10000000", statePath });
    await paperCreateOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.001",
      feeRate: 0,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    const s = await loadState(statePath);
    if (!s.success || !s.data) return;
    const orderTs = Date.parse(s.data.openOrders[0].createdAt);
    const fc: FetchCandles = async () => ({
      success: true,
      data: [candle(orderTs + 60_000, 5_000_000, 5_000_000, 4_900_000, 4_950_000)],
    });
    const h = await paperTradeHistory({
      statePath,
      fetchCandles: fc,
      getPairs: mockGetPairs,
      nowMs: orderTs + 120_000,
      feeRate: 0,
    });
    if (!h.success) return;
    expect(h.data).toHaveLength(1);
    expect(h.data[0].type).toBe("limit");
    expect(h.data[0].fillPrice).toBe(5000000);
  });
});

describe("paper tick gap warning", () => {
  it("emits a warning and caps the lookback when gap > 24h", async () => {
    await paperInit({ jpy: "10000000", statePath });
    await paperCreateOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.001",
      feeRate: 0,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    // Backdate lastTickAt by ~3 days
    {
      const raw = JSON.parse(readFileSync(statePath, "utf-8"));
      raw.lastTickAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      writeFileSync(statePath, JSON.stringify(raw));
    }
    let observedFrom = 0;
    let observedTo = 0;
    const fc: FetchCandles = async (_pair, fromMs, toMs) => {
      observedFrom = fromMs;
      observedTo = toMs;
      return { success: true, data: [] };
    };
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const t = await paperTick({ statePath, fetchCandles: fc });
    stderrSpy.mockRestore();
    if (!t.success) return;
    expect(t.data.warnings.length).toBeGreaterThan(0);
    expect(t.data.warnings[0]).toMatch(/24h/);
    // Window must be ~24h, not ~3 days
    expect(observedTo - observedFrom).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 1000);
    expect(observedTo - observedFrom).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);
  });
});

describe("paper tick partial-progress safety", () => {
  it("does not advance lastTickAt when a candle fetch fails", async () => {
    await paperInit({ jpy: "10000000", statePath });
    await paperCreateOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.001",
      feeRate: 0,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    const before = await loadState(statePath);
    if (!before.success || !before.data) throw new Error("state missing");
    const beforeTickAt = before.data.lastTickAt;
    const failingFc: FetchCandles = async () => ({ success: false, error: "upstream down" });
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const t = await paperTick({ statePath, fetchCandles: failingFc });
    stderrSpy.mockRestore();
    expect(t.success).toBe(true);
    if (!t.success) throw new Error(t.error);
    expect(t.data.warnings.join(" ")).toContain("failed");
    expect(t.data.lastTickAt).toBe(beforeTickAt);
    const after = await loadState(statePath);
    if (!after.success || !after.data) throw new Error("state missing");
    expect(after.data.lastTickAt).toBe(beforeTickAt);
    expect(after.data.openOrders).toHaveLength(1);
  });

  it("does not advance lastTickAt when --pair scopes the tick", async () => {
    await paperInit({ jpy: "100000000", statePath });
    await paperCreateOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.001",
      feeRate: 0,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    await paperCreateOrder({
      pair: "eth_jpy",
      side: "buy",
      type: "limit",
      price: "300000",
      amount: "0.01",
      feeRate: 0,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    const before = await loadState(statePath);
    if (!before.success || !before.data) throw new Error("state missing");
    const beforeTickAt = before.data.lastTickAt;
    const t = await paperTick({
      statePath,
      pair: "btc_jpy",
      fetchCandles: async () => ({ success: true, data: [] }),
    });
    expect(t.success).toBe(true);
    if (!t.success) throw new Error(t.error);
    // pair-scoped tick must not advance the global watermark — eth_jpy hasn't been processed.
    expect(t.data.lastTickAt).toBe(beforeTickAt);
    const after = await loadState(statePath);
    if (!after.success || !after.data) throw new Error("state missing");
    expect(after.data.lastTickAt).toBe(beforeTickAt);
  });
});

describe("paper cancel-order resolves fills first", () => {
  it("fills the order via lazy tick instead of canceling when price was touched", async () => {
    await paperInit({ jpy: "10000000", statePath });
    const placed = await paperCreateOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.001",
      feeRate: 0,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    if (!placed.success || !("placed" in placed.data)) throw new Error("expected placed");
    const id = placed.data.placed.id;
    const orderTs = Date.parse(placed.data.placed.createdAt);
    const fillingFc: FetchCandles = async () => ({
      success: true,
      data: [candle(orderTs + 60_000, 5_000_000, 5_000_000, 4_900_000, 4_950_000)],
    });
    const c = await paperCancelOrder({
      id,
      statePath,
      fetchCandles: fillingFc,
      getPairs: mockGetPairs,
      nowMs: orderTs + 120_000,
      feeRate: 0,
    });
    // Order should already be filled; cancel returns Err with "may have already filled".
    expect(c.success).toBe(false);
    if (c.success) throw new Error("expected cancel to fail because the order filled");
    expect(c.error).toMatch(/already filled/);
    const after = await loadState(statePath);
    if (!after.success || !after.data) throw new Error("state missing");
    expect(after.data.openOrders).toHaveLength(0);
    expect(after.data.history).toHaveLength(1);
    expect(after.data.balances.btc).toBeCloseTo(0.001, 10);
  });
});

describe("paper tick: live maker fee", () => {
  // 指値約定は必ず maker。約定手数料はペアのライブ maker_fee_rate_quote 由来
  // （負ならリベート）。getPairs / fetchCandles / nowMs を注入し実 API は叩かない。
  async function placeLimitBuy(price: string, amount: string): Promise<number> {
    await paperCreateOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price,
      amount,
      feeRate: 0,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    const s = await loadState(statePath);
    if (!s.success || !s.data) throw new Error("state missing");
    return Date.parse(s.data.openOrders[0].createdAt);
  }

  function fillingCandleAt(orderTs: number): FetchCandles {
    // low <= 5,000,000 <= high なので buy/sell どちらの指値も約定する。
    return async () => ({
      success: true,
      data: [candle(orderTs + 60_000, 5_000_000, 5_001_000, 4_999_000, 5_000_000)],
    });
  }

  it("limit buy fills at the pair's live maker_fee_rate_quote (no override)", async () => {
    await paperInit({ jpy: "10000000", statePath });
    const orderTs = await placeLimitBuy("5000000", "0.001");
    const t = await paperTick({
      statePath,
      fetchCandles: fillingCandleAt(orderTs),
      getPairs: mockGetPairsWith([{ name: "btc_jpy", maker_fee_rate_quote: 0.0004 }]),
      nowMs: orderTs + 120_000,
    });
    expect(t.success).toBe(true);
    if (!t.success) return;
    expect(t.data.filled).toHaveLength(1);
    // notional 0.001*5,000,000 = 5000; maker fee 5000*0.0004 = 2 (JPY rounded)
    expect(t.data.filled[0].feeQuote).toBe(2);
    const after = await loadState(statePath);
    if (!after.success || !after.data) return;
    expect(after.data.balances.jpy).toBe(10000000 - 5002);
    expect(after.data.balances.btc).toBeCloseTo(0.001, 10);
  });

  it("negative maker rebate lowers buy cost (pays less than notional)", async () => {
    await paperInit({ jpy: "10000000", statePath });
    const orderTs = await placeLimitBuy("5000000", "0.001");
    const t = await paperTick({
      statePath,
      fetchCandles: fillingCandleAt(orderTs),
      getPairs: mockGetPairsWith([{ name: "btc_jpy", maker_fee_rate_quote: -0.0002 }]),
      nowMs: orderTs + 120_000,
    });
    expect(t.success).toBe(true);
    if (!t.success) return;
    // notional 5000; rebate -0.0002 → rawFee -1 → feeQuote -1, cost 4999 (< 5000)
    expect(t.data.filled[0].feeQuote).toBe(-1);
    const after = await loadState(statePath);
    if (!after.success || !after.data) return;
    expect(after.data.balances.jpy).toBe(10000000 - 4999);
    expect(10000000 - after.data.balances.jpy).toBeLessThan(5000);
  });

  it("negative maker rebate raises sell proceeds (receives more than notional)", async () => {
    await paperInit({ jpy: "10000000", statePath });
    // fee-free 成行で btc を仕込んでから指値売りを置く。
    await paperCreateOrder(
      {
        pair: "btc_jpy",
        side: "buy",
        type: "market",
        amount: "0.01",
        feeRate: 0,
        statePath,
        getPairs: mockGetPairs,
      },
      { fetch: tickerFetch("5000000"), retries: 0 },
    );
    await paperCreateOrder({
      pair: "btc_jpy",
      side: "sell",
      type: "limit",
      price: "5000000",
      amount: "0.001",
      feeRate: 0,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    const s = await loadState(statePath);
    if (!s.success || !s.data) throw new Error("state missing");
    const orderTs = Date.parse(s.data.openOrders[0].createdAt);
    const jpyBefore = s.data.balances.jpy;
    const t = await paperTick({
      statePath,
      fetchCandles: fillingCandleAt(orderTs),
      getPairs: mockGetPairsWith([{ name: "btc_jpy", maker_fee_rate_quote: -0.0002 }]),
      nowMs: orderTs + 120_000,
    });
    expect(t.success).toBe(true);
    if (!t.success) return;
    // notional 5000; rebate rawFee -1 → feeQuote -1, proceeds 5001 (> 5000)
    expect(t.data.filled[0].feeQuote).toBe(-1);
    const after = await loadState(statePath);
    if (!after.success || !after.data) return;
    expect(after.data.balances.jpy - jpyBefore).toBe(5001);
  });

  it("charges zero fee on a campaign maker rate of 0 (kept, not defaulted to 0.0012)", async () => {
    await paperInit({ jpy: "10000000", statePath });
    const orderTs = await placeLimitBuy("5000000", "0.001");
    const t = await paperTick({
      statePath,
      fetchCandles: fillingCandleAt(orderTs),
      getPairs: mockGetPairsWith([{ name: "btc_jpy", maker_fee_rate_quote: 0 }]),
      nowMs: orderTs + 120_000,
    });
    expect(t.success).toBe(true);
    if (!t.success) return;
    // 0 は ?? でフォールバックされず維持される（default 0.0012 なら fee 6 になる）
    expect(t.data.filled[0].feeQuote).toBe(0);
    const after = await loadState(statePath);
    if (!after.success || !after.data) return;
    expect(after.data.balances.jpy).toBe(10000000 - 5000);
  });

  it("resolves each pair's maker rate independently across pairs", async () => {
    await paperInit({ jpy: "100000000", statePath });
    await paperCreateOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.001",
      feeRate: 0,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    await paperCreateOrder({
      pair: "eth_jpy",
      side: "buy",
      type: "limit",
      price: "300000",
      amount: "0.05",
      feeRate: 0,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    const s = await loadState(statePath);
    if (!s.success || !s.data) throw new Error("state missing");
    const tsBtc = Date.parse(
      (s.data.openOrders.find((o) => o.pair === "btc_jpy") ?? s.data.openOrders[0]).createdAt,
    );
    const tsEth = Date.parse(
      (s.data.openOrders.find((o) => o.pair === "eth_jpy") ?? s.data.openOrders[0]).createdAt,
    );
    const fc: FetchCandles = async (pair) =>
      pair === "btc_jpy"
        ? {
            success: true,
            data: [candle(tsBtc + 60_000, 5_000_000, 5_001_000, 4_999_000, 5_000_000)],
          }
        : { success: true, data: [candle(tsEth + 60_000, 300_000, 301_000, 299_000, 300_000)] };
    const t = await paperTick({
      statePath,
      fetchCandles: fc,
      getPairs: mockGetPairsWith([
        { name: "btc_jpy", maker_fee_rate_quote: 0.0004 },
        { name: "eth_jpy", maker_fee_rate_quote: -0.0002 },
      ]),
      nowMs: Math.max(tsBtc, tsEth) + 120_000,
    });
    expect(t.success).toBe(true);
    if (!t.success) return;
    expect(t.data.filled).toHaveLength(2);
    const btc = t.data.filled.find((f) => f.pair === "btc_jpy");
    const eth = t.data.filled.find((f) => f.pair === "eth_jpy");
    // btc: notional 5000 * 0.0004 = 2; eth: notional 15000 * -0.0002 = -3 (rebate)
    expect(btc?.feeQuote).toBe(2);
    expect(eth?.feeQuote).toBe(-3);
  });

  it("feeRate override beats the pair's maker rate for every fill", async () => {
    await paperInit({ jpy: "100000000", statePath });
    await paperCreateOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.001",
      feeRate: 0,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    await paperCreateOrder({
      pair: "eth_jpy",
      side: "buy",
      type: "limit",
      price: "300000",
      amount: "0.05",
      feeRate: 0,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    const s = await loadState(statePath);
    if (!s.success || !s.data) throw new Error("state missing");
    const tsBtc = Date.parse(
      (s.data.openOrders.find((o) => o.pair === "btc_jpy") ?? s.data.openOrders[0]).createdAt,
    );
    const tsEth = Date.parse(
      (s.data.openOrders.find((o) => o.pair === "eth_jpy") ?? s.data.openOrders[0]).createdAt,
    );
    const fc: FetchCandles = async (pair) =>
      pair === "btc_jpy"
        ? {
            success: true,
            data: [candle(tsBtc + 60_000, 5_000_000, 5_001_000, 4_999_000, 5_000_000)],
          }
        : { success: true, data: [candle(tsEth + 60_000, 300_000, 301_000, 299_000, 300_000)] };
    const t = await paperTick({
      statePath,
      fetchCandles: fc,
      // override 0.001 は per-pair maker（btc 0.0004 / eth -0.0002）より優先
      feeRate: 0.001,
      getPairs: mockGetPairsWith([
        { name: "btc_jpy", maker_fee_rate_quote: 0.0004 },
        { name: "eth_jpy", maker_fee_rate_quote: -0.0002 },
      ]),
      nowMs: Math.max(tsBtc, tsEth) + 120_000,
    });
    expect(t.success).toBe(true);
    if (!t.success) return;
    const btc = t.data.filled.find((f) => f.pair === "btc_jpy");
    const eth = t.data.filled.find((f) => f.pair === "eth_jpy");
    // 全約定に override 0.001: btc 5000*0.001 = 5, eth 15000*0.001 = 15
    expect(btc?.feeQuote).toBe(5);
    expect(eth?.feeQuote).toBe(15);
  });
});
