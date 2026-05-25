// 100行超: PnL 計算の各シナリオを網羅
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { paperInit } from "../../commands/paper/init.js";
import { type FetchTicker, formatPnl, paperPnl } from "../../commands/paper/pnl.js";
import type { FetchCandles } from "../../paper-fill.js";
import { computePnl, computePositions } from "../../paper-pnl.js";
import type { PaperHistoryEntry } from "../../paper-state.js";

let dir: string;
let statePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "paper-pnl-"));
  statePath = join(dir, "paper-state.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const noCandles: FetchCandles = async () => ({ success: true, data: [] });

function entry(
  pair: string,
  side: "buy" | "sell",
  amount: number,
  fillPrice: number,
  feeQuote: number,
  ts = "2024-01-01T00:00:00.000Z",
): PaperHistoryEntry {
  return {
    id: `${pair}-${side}-${ts}`,
    pair,
    side,
    type: "market",
    amount,
    fillPrice,
    feeQuote,
    filledAt: ts,
  };
}

function tickerFor(map: Record<string, number>): FetchTicker {
  return async (pair) =>
    map[pair] !== undefined
      ? { success: true, data: map[pair] }
      : { success: false, error: `no ticker for ${pair}` };
}

function writeHistory(entries: PaperHistoryEntry[]): void {
  const raw = JSON.parse(readFileSync(statePath, "utf-8"));
  raw.history = entries;
  writeFileSync(statePath, JSON.stringify(raw));
}

describe("computePnl: weighted-average cost basis", () => {
  it("buy then full sell: realized = (sellPrice - buyPrice) * amount - both fees", () => {
    const r = computePnl({
      history: [entry("btc_jpy", "buy", 1, 100, 1), entry("btc_jpy", "sell", 1, 200, 2)],
      tickerByPair: { btc_jpy: 200 },
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    const row = r.data.perPair.btc_jpy;
    // buy fee 1 → avgCost = 100 + 1 = 101. sell at 200 with fee 2 → realized = (200-101)*1 - 2 = 97
    expect(row.realizedPnl).toBeCloseTo(97, 9);
    expect(row.position).toBe(0);
    expect(row.unrealizedPnl).toBe(0);
  });

  it("multiple buys produce weighted-average cost", () => {
    const r = computePositions([
      entry("btc_jpy", "buy", 1, 100, 0),
      entry("btc_jpy", "buy", 3, 200, 0),
    ]);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.btc_jpy.position).toBe(4);
    expect(r.data.btc_jpy.avgCost).toBeCloseTo((100 * 1 + 200 * 3) / 4, 9); // 175
  });

  it("partial sell: realized = (sellPrice - avgCost) * sellAmount - sellFee", () => {
    const r = computePnl({
      history: [entry("btc_jpy", "buy", 2, 100, 0), entry("btc_jpy", "sell", 1, 150, 5)],
      tickerByPair: { btc_jpy: 150 },
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    const row = r.data.perPair.btc_jpy;
    // realized = (150 - 100) * 1 - 5 = 45
    expect(row.realizedPnl).toBeCloseTo(45, 9);
    expect(row.position).toBe(1);
    // unrealized = (150 - 100) * 1 = 50
    expect(row.unrealizedPnl).toBeCloseTo(50, 9);
    expect(row.totalPnl).toBeCloseTo(95, 9);
  });

  it("buy fee is included in avgCost via per-unit fee", () => {
    const r = computePositions([entry("btc_jpy", "buy", 4, 100, 8)]);
    expect(r.success).toBe(true);
    if (!r.success) return;
    // perUnitFee = 8/4 = 2 → avgCost = 100 + 2 = 102
    expect(r.data.btc_jpy.avgCost).toBeCloseTo(102, 9);
  });

  it("unrealized = (currentPrice - avgCost) * position", () => {
    const r = computePnl({
      history: [entry("btc_jpy", "buy", 2, 100, 0)],
      tickerByPair: { btc_jpy: 150 },
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.perPair.btc_jpy.unrealizedPnl).toBeCloseTo(100, 9);
  });

  it("totals sum across pairs", () => {
    const r = computePnl({
      history: [entry("btc_jpy", "buy", 1, 100, 0), entry("eth_jpy", "buy", 2, 50, 0)],
      tickerByPair: { btc_jpy: 200, eth_jpy: 60 },
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    // btc unrealized = (200-100)*1 = 100; eth = (60-50)*2 = 20
    expect(r.data.total.unrealizedPnl).toBeCloseTo(120, 9);
    expect(r.data.total.realizedPnl).toBe(0);
    expect(r.data.total.totalPnl).toBeCloseTo(120, 9);
  });

  it("excludes pairs where position == 0 and realized == 0", () => {
    const r = computePnl({
      history: [entry("btc_jpy", "buy", 1, 100, 0), entry("btc_jpy", "sell", 1, 100, 0)],
      tickerByPair: { btc_jpy: 100 },
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(Object.keys(r.data.perPair)).not.toContain("btc_jpy");
  });

  it("includes pairs where position == 0 but realized != 0", () => {
    const r = computePnl({
      history: [entry("btc_jpy", "buy", 1, 100, 0), entry("btc_jpy", "sell", 1, 200, 0)],
      tickerByPair: { btc_jpy: 200 },
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.perPair.btc_jpy).toBeDefined();
    expect(r.data.perPair.btc_jpy.position).toBe(0);
    expect(r.data.perPair.btc_jpy.realizedPnl).toBeCloseTo(100, 9);
    // avgCost stays at the old value (100) per spec.
    expect(r.data.perPair.btc_jpy.avgCost).toBeCloseTo(100, 9);
  });

  it("avgCost is preserved across position-zero state and overwritten by next buy", () => {
    const r = computePositions([
      entry("btc_jpy", "buy", 1, 100, 0),
      entry("btc_jpy", "sell", 1, 100, 0),
      entry("btc_jpy", "buy", 1, 200, 0),
    ]);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.btc_jpy.position).toBe(1);
    // After full sell, avgCost stays at 100; new buy on position 0 -> avgCost = 200.
    expect(r.data.btc_jpy.avgCost).toBeCloseTo(200, 9);
  });

  it("returns Err when sell would produce negative position", () => {
    const r = computePositions([entry("btc_jpy", "sell", 1, 100, 0)]);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error).toContain("negative position");
  });

  it("empty history → empty perPair and zero totals", () => {
    const r = computePnl({ history: [], tickerByPair: {} });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.perPair).toEqual({});
    expect(r.data.total).toEqual({ realizedPnl: 0, unrealizedPnl: 0, totalPnl: 0 });
  });
});

describe("paperPnl: state + ticker integration", () => {
  it("returns Err when state is not initialized", async () => {
    const r = await paperPnl({ statePath, fetchCandles: noCandles });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("not initialized");
  });

  it("empty state returns empty perPair without error", async () => {
    await paperInit({ jpy: "1000000", statePath });
    const r = await paperPnl({
      statePath,
      fetchCandles: noCandles,
      fetchTicker: tickerFor({}),
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.perPair).toEqual({});
    expect(r.data.total.totalPnl).toBe(0);
  });

  it("excludes non-JPY pairs and emits stderr warning while computing JPY pairs", async () => {
    await paperInit({ jpy: "100000000", statePath });
    writeHistory([entry("btc_jpy", "buy", 1, 100, 0), entry("btc_eth", "buy", 1, 0.05, 0)]);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const r = await paperPnl({
      statePath,
      fetchCandles: noCandles,
      fetchTicker: tickerFor({ btc_jpy: 200 }),
    });
    const warned = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    stderrSpy.mockRestore();
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(warned).toContain("non-JPY");
    expect(warned).toContain("btc_eth");
    expect(r.data.perPair.btc_jpy).toBeDefined();
    expect(r.data.perPair.btc_eth).toBeUndefined();
  });

  it("--pair filter restricts both ticker fetch and output", async () => {
    await paperInit({ jpy: "100000000", statePath });
    writeHistory([entry("btc_jpy", "buy", 1, 100, 0), entry("eth_jpy", "buy", 1, 50, 0)]);
    const fetched: string[] = [];
    const ft: FetchTicker = async (p) => {
      fetched.push(p);
      return { success: true, data: 200 };
    };
    const r = await paperPnl({
      pair: "btc_jpy",
      statePath,
      fetchCandles: noCandles,
      fetchTicker: ft,
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(fetched).toEqual(["btc_jpy"]);
    expect(Object.keys(r.data.perPair)).toEqual(["btc_jpy"]);
  });

  it("--pair must be a JPY pair", async () => {
    await paperInit({ jpy: "100", statePath });
    const r = await paperPnl({ pair: "btc_eth", statePath, fetchCandles: noCandles });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("JPY pair");
  });

  it("ticker fetch failure surfaces as Err", async () => {
    await paperInit({ jpy: "100000000", statePath });
    writeHistory([entry("btc_jpy", "buy", 1, 100, 0)]);
    const r = await paperPnl({
      statePath,
      fetchCandles: noCandles,
      fetchTicker: async () => ({ success: false, error: "upstream" }),
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("ticker for btc_jpy");
  });

  it("fetches tickers in parallel for multiple pairs", async () => {
    await paperInit({ jpy: "100000000", statePath });
    writeHistory([entry("btc_jpy", "buy", 1, 100, 0), entry("eth_jpy", "buy", 1, 50, 0)]);
    let inflight = 0;
    let maxInflight = 0;
    const ft: FetchTicker = async () => {
      inflight++;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise((res) => setTimeout(res, 10));
      inflight--;
      return { success: true, data: 1 };
    };
    const r = await paperPnl({ statePath, fetchCandles: noCandles, fetchTicker: ft });
    expect(r.success).toBe(true);
    expect(maxInflight).toBeGreaterThanOrEqual(2);
  });
});

describe("formatPnl: output formats", () => {
  const sample = {
    perPair: {
      btc_jpy: {
        pair: "btc_jpy",
        position: 0.5,
        avgCost: 100,
        currentPrice: 200,
        realizedPnl: 10,
        unrealizedPnl: 50,
        totalPnl: 60,
      },
    },
    total: { realizedPnl: 10, unrealizedPnl: 50, totalPnl: 60 },
  };

  function capture(fn: () => void): { stdout: string } {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    fn();
    const stdout = spy.mock.calls.map((c) => String(c[0])).join("");
    spy.mockRestore();
    return { stdout };
  }

  it("json: nested perPair + total", () => {
    const { stdout } = capture(() => formatPnl({ success: true, data: sample }, "json"));
    const parsed = JSON.parse(stdout);
    expect(parsed.perPair.btc_jpy.totalPnl).toBe(60);
    expect(parsed.total.totalPnl).toBe(60);
  });

  it("table: includes header, pair row, and TOTAL row", () => {
    const { stdout } = capture(() => formatPnl({ success: true, data: sample }, "table"));
    expect(stdout).toContain("pair");
    expect(stdout).toContain("btc_jpy");
    expect(stdout).toContain("TOTAL");
  });

  it("csv: header + pair rows, no TOTAL row", () => {
    const { stdout } = capture(() => formatPnl({ success: true, data: sample }, "csv"));
    expect(
      stdout.startsWith("pair,position,avgCost,currentPrice,realizedPnl,unrealizedPnl,totalPnl"),
    ).toBe(true);
    expect(stdout).toContain("btc_jpy");
    expect(stdout).not.toContain("TOTAL");
  });

  it("Err result writes to stderr and sets exitCode", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const prev = process.exitCode;
    formatPnl({ success: false, error: "boom" }, "json");
    const err = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    stderrSpy.mockRestore();
    expect(err).toContain("boom");
    expect(process.exitCode).toBe(1);
    process.exitCode = prev;
  });
});
