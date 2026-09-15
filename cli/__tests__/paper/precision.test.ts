// issue #30: 残高の丸め誤差で全量売却が永久に通らなくなる問題の回帰テスト
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { paperCreateOrder } from "../../commands/paper/create-order.js";
import { paperInit } from "../../commands/paper/init.js";
import { computePositions } from "../../paper-pnl.js";
import { BALANCE_EPS, hasEnough, snapAmount } from "../../paper-precision.js";
import { loadState, type PaperState, saveState } from "../../paper-state.js";
import { mockFetchData, mockGetPairs } from "../test-helpers.js";

const tickerOf = (last: string) =>
  mockFetchData({
    sell: last,
    buy: last,
    high: last,
    low: last,
    open: last,
    last,
    vol: "10",
    timestamp: 1700000000000,
  });

describe("snapAmount / hasEnough", () => {
  it("snaps accumulated float noise to a clean decimal", () => {
    expect(snapAmount(0.0031999999999999967)).toBe(0.0032);
    expect(snapAmount(0.1 + 0.2)).toBe(0.3);
  });

  it("normalizes -0 and sub-precision dust to 0", () => {
    expect(Object.is(snapAmount(-0), 0)).toBe(true);
    expect(snapAmount(3.3e-18)).toBe(0);
  });

  it("keeps large JPY balances exact (toFixed path, not Math.round overflow)", () => {
    expect(snapAmount(1_000_000_000.5)).toBe(1_000_000_000.5);
    expect(snapAmount(987654321)).toBe(987654321);
  });

  it("hasEnough tolerates shortfall within EPS but not beyond", () => {
    expect(hasEnough(0.0031999999999999967, 0.0032)).toBe(true);
    expect(hasEnough(0.0032 - BALANCE_EPS * 2, 0.0032)).toBe(false);
    expect(hasEnough(0.0032, 0.0032)).toBe(true);
  });
});

describe("paper create-order: full-position sell survives float drift (issue #30)", () => {
  let dir: string;
  let statePath: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "paper-prec-"));
    statePath = join(dir, "paper-state.json");
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const order = (side: "buy" | "sell", amount: string, last = "10000000") =>
    paperCreateOrder(
      { pair: "btc_jpy", side, type: "market", amount, statePath, getPairs: mockGetPairs },
      { fetch: tickerOf(last), retries: 0 },
    );

  it("sells the exact pnl position even when a pre-fix state carries drifted balances", async () => {
    await paperInit({ jpy: "1000000", statePath });
    const loaded = await loadState(statePath);
    if (!loaded.success || !loaded.data) throw new Error("init failed");
    // 修正前の CLI が書いた state を模す: 残高は誤差入り、履歴の合計は 0.0032
    const drifted: PaperState = {
      ...loaded.data,
      balances: { jpy: 900000, btc: 0.0031999999999999967 },
      history: [
        {
          id: "a",
          pair: "btc_jpy",
          side: "buy",
          type: "market",
          amount: 0.0072,
          fillPrice: 1e7,
          feeQuote: 0,
          filledAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "b",
          pair: "btc_jpy",
          side: "sell",
          type: "market",
          amount: 0.004,
          fillPrice: 1e7,
          feeQuote: 0,
          filledAt: "2026-01-01T00:01:00.000Z",
        },
      ],
    };
    await saveState(drifted, statePath);
    const r = await order("sell", "0.0032");
    expect(r.success).toBe(true);
    if (!r.success || !("balances" in r.data)) return;
    expect(r.data.balances.btc).toBe(0);
  });

  it("keeps balances and pnl position identical across many buy/sell rounds", async () => {
    await paperInit({ jpy: "100000000", statePath });
    const rounds: [string, string][] = [
      ["0.0163", "0.0091"],
      ["0.0072", "0.0072"],
      ["0.0107", "0.0119"],
      ["0.0133", "0.0101"],
      ["0.0091", "0.0123"],
      ["0.0157", "0.0117"],
    ];
    for (const [b, s] of rounds) {
      expect((await order("buy", b)).success).toBe(true);
      expect((await order("sell", s)).success).toBe(true);
    }
    const state = JSON.parse(readFileSync(statePath, "utf-8")) as PaperState;
    const pos = computePositions(state.history);
    if (!pos.success) throw new Error(pos.error);
    expect(state.balances.btc).toBe(pos.data.btc_jpy.position);
    expect(state.balances.btc).toBe(0.01);
    // 全量売却が通る
    const r = await order("sell", String(pos.data.btc_jpy.position));
    expect(r.success).toBe(true);
    if (!r.success || !("balances" in r.data)) return;
    expect(r.data.balances.btc).toBe(0);
  });
});
