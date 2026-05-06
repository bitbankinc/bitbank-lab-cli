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

describe("paper state v1 → v2 migration", () => {
  it("loads a v1 state file and returns v2 in memory", async () => {
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
    expect(r.data.version).toBe(2);
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
      { pair: "btc_jpy", side: "buy", type: "market", amount: "0.01", feeRate: 0, statePath },
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
