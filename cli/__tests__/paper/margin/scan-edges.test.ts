// 100行超: CodeRabbit のレビューで見つかった信用の走査の端（末尾の利息・4hour 足の途中の時刻・別の tick が済ませた区間・
// lock 待ちの間に進んだ走査済み時刻・pairs から消えたペア）を、それぞれ修正前の挙動では落ちる形で並べて検査する
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { paperCreateMarginOrder } from "../../../commands/paper/create-margin-order.js";
import { checkOrderPair } from "../../../commands/paper/margin-order-prep.js";
import type { Candle } from "../../../commands/public/candles-fetch.js";
import { EXIT } from "../../../exit-codes.js";
import { runTick } from "../../../paper-fill.js";
import { applyMarginOrder } from "../../../paper-margin/order.js";
import { marginParamsOf } from "../../../paper-margin/params.js";
import { applyMarginTick } from "../../../paper-margin/tick.js";
import { loadState, type PaperState } from "../../../paper-state.js";
import { BTC, candlesOf, longPosition, MIN, pairsOf, seedState, stateAt } from "./fixtures.js";

const P = Date.parse;
const iso = (ms: number) => new Date(ms).toISOString();
const HOUR = 60 * MIN;

const lookup = marginParamsOf(BTC, P("2026-11-02T00:00:00Z"));
if (lookup.kind !== "ok") throw new Error(lookup.kind);
const params = new Map([["btc_jpy", lookup.params]]);
const candle = (timestamp: number, low: number, high: number, close = high): Candle => ({
  timestamp,
  ...{ open: high, high, low, close, vol: 1 },
});
const tickOf = (state: PaperState, candles: Candle[], nowMs: number, periodMs = MIN) => {
  const scanned = P(state.margin.lastScanAt ?? state.lastTickAt);
  const input = {
    candlesByPair: new Map([["btc_jpy", candles]]),
    params,
    candleFromMs: Math.floor(scanned / periodMs) * periodMs,
    periodMs,
    approximate: periodMs > MIN,
  };
  const r = applyMarginTick(state, input, nowMs, { newId: () => "x" });
  if (!r.success) throw new Error(r.error);
  return r.data;
};

describe("the end of the scan window", () => {
  it("judges the losscut after the interest charged at a JST midnight past the last candle", () => {
    // JPY 250,200・ロング 0.1（建値の合計 1,000,000）。JST 0 時の利息 400 で B が 249,800 になり、基準 250,000 を割る
    const at = "2026-11-02T14:50:00.000Z"; // 23:50 JST
    const state = stateAt(
      at,
      { balances: { jpy: 250_200 } },
      { positions: [longPosition(at)], lastScanAt: at },
    );
    const now = P("2026-11-02T15:10:00Z"); // 翌 00:10 JST
    const r = tickOf(state, [candle(P("2026-11-02T14:55:00Z"), 1e7, 1e7)], now);
    expect(r.report.events).toEqual([
      { kind: "losscut", at: iso(now), reason: "below-losscut", canceled: [] },
    ]);
  });
});

describe("4hour candles (gap over 24h)", () => {
  it("judges 15:00 JST mid-candle with the candle's extremes, not its later close", () => {
    // 04:00Z〜08:00Z の足の途中の 06:00Z（15:00 JST）。終値 10,000,000 なら B 600,000 ≥ Mm 500,000 だが、
    // 足の安値 8,900,000 では B 490,000 < Mm で追証になる（終値は 15 時より後の価格）
    const at = "2026-11-02T03:00:00.000Z";
    const state = stateAt(
      at,
      { balances: { jpy: 600_000 } },
      { positions: [longPosition(at)], lastScanAt: at },
    );
    const candles = [
      candle(P("2026-11-02T00:00:00Z"), 1e7, 1e7),
      candle(P("2026-11-02T04:00:00Z"), 8_900_000, 1e7, 1e7),
    ];
    const r = tickOf(state, candles, P("2026-11-02T07:00:00Z"), 4 * HOUR);
    expect(r.report.events.map((e) => e.kind)).toEqual(["margin-call"]);
  });
});

describe("another tick already scanned past now", () => {
  let dir: string;
  let statePath: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "paper-scan-edges-"));
    statePath = join(dir, "paper-state.json");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("a late tick does not re-scan the candle at its now against a position opened after it", async () => {
    const T0 = P("2026-11-02T00:00:00Z");
    const opened = iso(T0 + 10 * MIN);
    await seedState(
      statePath,
      stateAt(
        opened,
        { balances: { jpy: 400_000 } },
        { positions: [longPosition(opened)], lastScanAt: opened },
      ),
    );
    const r = await runTick({
      statePath,
      nowMs: T0 + 5 * MIN + 30_000,
      fetchCandles: candlesOf([[T0 + 5 * MIN, 2_000_000, 1e7]]),
      getPairs: pairsOf(BTC),
    });
    if (!r.success) throw new Error(r.error);
    const s = await loadState(statePath);
    expect(s.success && s.data?.margin.positions).toHaveLength(1);
    expect(s.success && s.data?.margin.lastScanAt).toBe(opened); // 戻さない
  });

  it("an order whose lock waited past a later scan is stamped at that scan, not its older now", () => {
    const T0 = P("2026-11-02T00:00:00Z");
    const scanned = iso(T0 + 10 * MIN);
    const state = stateAt(scanned, {}, { lastScanAt: scanned });
    const plan = {
      ...{ pair: "btc_jpy", side: "buy" as const, positionSide: "long" as const, amount: 0.01 },
      op: { label: "ロング新規建て（buy × long）", intent: "open" as const },
      ...{ params, prices: new Map([["btc_jpy", 1e7]]), nowMs: T0 + 5 * MIN, newId: () => "o1" },
    };
    const limit = applyMarginOrder(state, { ...plan, type: "limit", price: 9e6 });
    if (!limit.success || !("placed" in limit.data.result)) throw new Error("not placed");
    expect(limit.data.result.placed.createdAt).toBe(scanned);
    const market = applyMarginOrder(state, { ...plan, type: "market" });
    if (!market.success || !("fill" in market.data.result)) throw new Error("not filled");
    expect(market.data.result.position?.openedAt).toBe(scanned);
  });
});

describe("a pair that is no longer in pairs", () => {
  let dir: string;
  let statePath: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "paper-unlisted-"));
    statePath = join(dir, "paper-state.json");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("also refuses when the pair disappears from the pairs refetched for a stale risk ratio", async () => {
    // 最初の pairs（古いキャッシュ）には載っていて比率が期限切れ、取り直した pairs からは消えている。控えがあっても通さない
    const stale = { ...BTC, margin_current_individual_until: P("2026-11-01T00:00:00Z") };
    const r = await checkOrderPair(
      {
        ...{ pair: "btc_jpy", type: "market" as const, amount: 0.01 },
        ...{ positionSide: "long" as const, intent: "close" as const },
      },
      {
        nowMs: P("2026-11-02T00:00:00Z"),
        getPairs: pairsOf(stale),
        refreshPairs: pairsOf(),
        lastKnown: lookup.params,
      },
    );
    expect(!r.success && r.error).toContain("pairs に無いペアです");
  });

  it("refuses with an explicit PARAM error, closes included (no candles or ticker to price it)", async () => {
    await seedState(statePath, stateAt("2026-11-02T00:00:00.000Z"));
    const r = await paperCreateMarginOrder({
      ...{ pair: "xrp_jpy", side: "sell", positionSide: "long", intent: "close" },
      ...{ type: "market", amount: "1", statePath, getPairs: pairsOf(BTC) },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.exitCode).toBe(EXIT.PARAM);
      expect(r.error).toContain("pairs に無いペアです");
    }
  });
});
