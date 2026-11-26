// 100行超: 既存の paper コマンド（trade-history / pnl）の信用対応を、現物だけの口座で出力が変わらないことと併せて検査する
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatPnl, paperPnl } from "../../../commands/paper/pnl.js";
import { paperTradeHistory } from "../../../commands/paper/trade-history.js";
import type { CachedPair } from "../../../pairs-cache.js";
import type { FetchCandles } from "../../../paper-fill.js";
import type { MarginHistoryEntry } from "../../../paper-margin/history.js";
import { computeMarginPnl } from "../../../paper-margin/pnl.js";
import { emptyMarginState } from "../../../paper-margin/state.js";
import { type PaperHistoryEntry, type PaperState, saveState } from "../../../paper-state.js";
import { MOCK_PAIRS } from "../../test-helpers.js";

const T0 = Date.parse("2026-11-02T00:00:00Z");
const iso = (t: number) => new Date(t).toISOString();
const margin = (pair: string): CachedPair => ({
  ...MOCK_PAIRS[0],
  name: pair,
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
});
const getPairs = async () => ({
  success: true as const,
  data: [margin("btc_jpy"), margin("eth_jpy")],
});
const flat: FetchCandles = async (pair, from, to) => {
  const px = pair === "eth_jpy" ? 450_000 : 1e7;
  const c = { timestamp: T0 + 60_000, open: px, high: px, low: px, close: px, vol: 1 };
  return { success: true, data: c.timestamp >= from && c.timestamp <= to ? [c] : [] };
};
const fetchTicker = async (pair: string) => ({
  success: true as const,
  data: pair === "eth_jpy" ? 450_000 : 11_000_000,
});

const SPOT: PaperHistoryEntry = {
  id: "s1",
  pair: "btc_jpy",
  side: "buy",
  type: "market",
  amount: 0.01,
  fillPrice: 1e7,
  feeQuote: 120,
  filledAt: iso(T0 + 30_000),
};
const CLOSED: MarginHistoryEntry = {
  id: "m1",
  pair: "btc_jpy",
  side: "sell",
  positionSide: "long",
  type: "market",
  amount: 0.01,
  fillPrice: 1.1e7,
  feeOccurred: 110,
  feeCharged: 210,
  profitLoss: 1_000,
  interest: 0,
  filledAt: iso(T0 + 10_000),
};

let dir: string;
let statePath: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "paper-margin-integ-"));
  statePath = join(dir, "paper-state.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function seed(history: PaperHistoryEntry[], m: Partial<PaperState["margin"]> = {}) {
  await saveState(
    {
      version: 4,
      createdAt: iso(T0),
      updatedAt: iso(T0),
      initialJpy: 1_000_000,
      balances: { jpy: 1_000_000, btc: 0.01 },
      history,
      lastTickAt: iso(T0),
      openOrders: [],
      margin: { ...emptyMarginState(iso(T0)), ...m },
    },
    statePath,
  );
}

const SHORT = {
  pair: "eth_jpy",
  positionSide: "short" as const,
  openAmount: 1,
  product: 500_000,
  unrealizedFee: 600,
  unrealizedInterest: 200,
  openedAt: iso(T0),
  lastInterestAt: iso(T0),
};
const common = () => ({ statePath, getPairs, fetchCandles: flat, nowMs: T0 + 5 * 60_000 });

describe("paper trade-history", () => {
  it("merges spot and margin fills in time order with the same keys on every row", async () => {
    await seed([SPOT], { history: [CLOSED] });
    const r = await paperTradeHistory(common());
    if (!r.success) throw new Error(r.error);
    expect(r.data.map((x) => x.id)).toEqual(["m1", "s1"]);
    expect(Object.keys(r.data[0])).toEqual(Object.keys(r.data[1]));
    const json = JSON.parse(JSON.stringify(r.data));
    expect(json[1]).toEqual(SPOT); // 現物の行は JSON では従来どおり
    expect(json[0]).toMatchObject({ positionSide: "long", profitLoss: 1_000 });
  });

  it("leaves a spot-only history untouched", async () => {
    await seed([SPOT]);
    const r = await paperTradeHistory(common());
    expect(r.success && r.data).toEqual([SPOT]);
  });
});

describe("computeMarginPnl rounding", () => {
  it("the total of one row equals that row (sums raw values, rounds once; live run: −1356.2 vs −1356.2001)", () => {
    const pos = {
      pair: "btc_jpy",
      positionSide: "long" as const,
      openAmount: 0.04,
      product: 384_637.28,
      unrealizedFee: 384.63728,
      unrealizedInterest: 0,
      openedAt: iso(T0),
      lastInterestAt: iso(T0),
    };
    const fill = { ...CLOSED, profitLoss: -348.04276 };
    const r = computeMarginPnl(
      { ...emptyMarginState(iso(T0)), positions: [pos], history: [fill] },
      new Map([["btc_jpy", 9_600_344]]),
    );
    if (!r.success || !r.data) throw new Error("no margin pnl");
    expect(r.data.perPosition[0].totalPnl).toBe(-1356.2);
    expect(r.data.total.totalPnl).toBe(-1356.2);
  });
});

describe("paper pnl", () => {
  it("adds a margin section (realized from fills, unrealized net of unsettled costs) and keeps the spot totals", async () => {
    await seed([], { positions: [SHORT], history: [CLOSED] });
    const r = await paperPnl({ ...common(), fetchTicker });
    if (!r.success) throw new Error(r.error);
    expect(r.data.total).toEqual({ realizedPnl: 0, unrealizedPnl: 0, totalPnl: 0 });
    expect(r.data.margin?.perPosition).toEqual([
      {
        pair: "btc_jpy",
        positionSide: "long",
        position: 0,
        avgCost: 0,
        currentPrice: 11_000_000, // 全量返済済みのペアにも現在値を出す（現物の売り切ったペアと同じ）
        realizedPnl: 1_000,
        unrealizedPnl: 0,
        totalPnl: 1_000,
      },
      // (500,000 − 450,000) × 1 − 手数料 600 − 利息 200
      {
        pair: "eth_jpy",
        positionSide: "short",
        position: 1,
        avgCost: 500_000,
        currentPrice: 450_000,
        realizedPnl: 0,
        unrealizedPnl: 49_200,
        totalPnl: 49_200,
      },
    ]);
    expect(r.data.margin?.total).toEqual({
      realizedPnl: 1_000,
      unrealizedPnl: 49_200,
      totalPnl: 50_200,
    });
  });

  it("--pair narrows the margin rows too, and a spot-only account has no margin key", async () => {
    await seed([], { positions: [SHORT], history: [CLOSED] });
    const r = await paperPnl({ ...common(), fetchTicker, pair: "eth_jpy" });
    expect(r.success && r.data.margin?.perPosition.map((x) => x.pair)).toEqual(["eth_jpy"]);
    await seed([SPOT]);
    const spotOnly = await paperPnl({ ...common(), fetchTicker });
    expect(spotOnly.success && "margin" in spotOnly.data).toBe(false);
  });

  it("the table shows margin rows and a MARGIN TOTAL after the spot TOTAL", async () => {
    await seed([], { positions: [SHORT], history: [CLOSED] });
    const r = await paperPnl({ ...common(), fetchTicker });
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    formatPnl(r, "table");
    const out = spy.mock.calls.map((c) => String(c[0])).join("");
    spy.mockRestore();
    expect(out).toContain("eth_jpy short (margin)");
    expect(out).toMatch(/MARGIN TOTAL\s+1000\s+49200\s+50200/);
    expect(out.indexOf("TOTAL")).toBeLessThan(out.indexOf("MARGIN TOTAL"));
  });
});
