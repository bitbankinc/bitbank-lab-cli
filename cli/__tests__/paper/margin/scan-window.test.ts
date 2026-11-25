// 100行超: 信用の走査の窓（取得する足の日付・走査済み時刻・lock の内外のずれ）の回帰を、どれも
// 「建玉が存在しなかった時刻の足で評価しない／足を飛ばさない」という 1 つの性質として並べて検査する
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { paperCreateMarginOrder } from "../../../commands/paper/create-margin-order.js";
import { runTick } from "../../../paper-fill.js";
import { applyMarginOrder } from "../../../paper-margin/order.js";
import { marginParamsOf } from "../../../paper-margin/params.js";
import { applyMarginTick } from "../../../paper-margin/tick.js";
import { loadState, type PaperState } from "../../../paper-state.js";
import {
  BTC,
  candlesOf,
  longPosition,
  MIN,
  pairsOf,
  seedState,
  stateAt,
  tickerAt,
} from "./fixtures.js";

const P = Date.parse;
const iso = (ms: number) => new Date(ms).toISOString();
const LAST = "2026-11-02T00:00:00.000Z"; // 09:00 JST
const T0 = P(LAST);

let dir: string;
let statePath: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "paper-scan-window-"));
  statePath = join(dir, "paper-state.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function load(): Promise<PaperState> {
  const r = await loadState(statePath);
  if (!r.success || !r.data) throw new Error("load failed");
  return r.data;
}

/** 現物の xrp 売り指値（足の取得を失敗させて、現物の lastTickAt だけを止めるのに使う） */
const XRP_SELL = {
  id: "s1",
  pair: "xrp_jpy",
  side: "sell" as const,
  type: "limit" as const,
  price: 1_000,
  amount: 1,
  createdAt: LAST,
};

describe("1min candles over a window that spans three UTC dates", () => {
  it("fetches the middle date too, and sees a crash on it", async () => {
    // 前回の走査 2026-11-01T00:30Z → now 2026-11-02T00:20Z（23h50m、1min 足）。窓は 1 時間前の 10-31 23:30Z から
    const scanned = "2026-11-01T00:30:00.000Z";
    await seedState(statePath, stateAt(scanned, {}, { positions: [longPosition(scanned)] }));
    const asked: string[] = [];
    const ohlcv: Record<string, Array<[string, string, string, string, string, number]>> = {
      "20261031": [["1e7", "1e7", "1e7", "1e7", "1", P("2026-10-31T23:45:00Z")]],
      "20261101": [["1e7", "1e7", "2000000", "2000000", "1", P("2026-11-01T12:00:00Z")]],
      "20261102": [["1e7", "1e7", "1e7", "1e7", "1", P("2026-11-02T00:10:00Z")]],
    };
    const fetchMock = (async (url: string | URL) => {
      const date = String(url).split("/").at(-1) ?? "";
      asked.push(date);
      const candlestick = [{ type: "1min", ohlcv: ohlcv[date] ?? [] }];
      return new Response(JSON.stringify({ success: 1, data: { candlestick, timestamp: 1 } }));
    }) as typeof fetch;
    const r = await runTick({
      statePath,
      nowMs: P("2026-11-02T00:20:00Z"),
      getPairs: pairsOf(BTC),
      httpOptions: { fetch: fetchMock, retries: 0 },
    });
    if (!r.success) throw new Error(r.error);
    expect(asked).toEqual(["20261031", "20261101", "20261102"]);
    expect(r.data.margin?.events.map((e) => e.kind)).toEqual(["losscut"]);
  });
});

describe("the margin scan has its own watermark (margin.lastScanAt)", () => {
  it("a spot fetch failure does not make the next tick re-scan, with a later-opened position, the candles already scanned", async () => {
    const order = {
      id: "m1",
      pair: "btc_jpy",
      side: "buy" as const,
      positionSide: "long" as const,
      type: "limit" as const,
      price: 9_900_000,
      amount: 0.01,
      createdAt: iso(T0 + 2 * MIN),
    };
    const s0 = stateAt(LAST, { balances: { jpy: 100_000, xrp: 10 }, openOrders: [XRP_SELL] });
    await seedState(statePath, { ...s0, margin: { ...s0.margin, orders: [order] } });
    // +1 分の暴落は注文より前（建玉が無い）。+3 分の足で指値の新規建てが約定する
    const fetchCandles = candlesOf(
      [
        [T0 + MIN, 1_000_000, 1e7],
        [T0 + 3 * MIN, 9_800_000, 1e7],
      ],
      ["xrp_jpy"],
    );
    const getPairs = pairsOf(BTC);
    const first = await runTick({ statePath, nowMs: T0 + 10 * MIN, fetchCandles, getPairs });
    if (!first.success) throw new Error(first.error);
    let s = await load();
    expect(s.lastTickAt).toBe(LAST); // 現物は xrp の足が取れず止まる
    expect(s.margin.lastScanAt).toBe(iso(T0 + 10 * MIN)); // 信用は走査できたので進む
    expect(s.margin.positions).toHaveLength(1);
    // 以前は 2 回目も LAST から走査し直し、+3 分に建った建玉を +1 分の暴落で強制決済していた
    const second = await runTick({ statePath, nowMs: T0 + 20 * MIN, fetchCandles, getPairs });
    if (!second.success) throw new Error(second.error);
    s = await load();
    expect(second.data.margin?.events).toEqual([]);
    expect(s.margin.positions).toHaveLength(1);
    expect(s.margin.history.map((h) => h.type)).toEqual(["limit"]);
  });

  it("the first margin order is not evaluated against candles from before it was placed", async () => {
    // 現物の足が取れず lastTickAt が 1 時間前で止まっていても、信用の建玉・注文が無ければ走査済み時刻は now に進む
    const at = T0 + 60 * MIN;
    await seedState(
      statePath,
      stateAt(LAST, { balances: { jpy: 60_000, xrp: 10 }, openOrders: [XRP_SELL] }),
    );
    const fetchCandles = candlesOf(
      [
        [T0 + 30 * MIN, 2_000_000, 1e7], // 建てる前の暴落
        [at + MIN, 1e7, 1e7],
      ],
      ["xrp_jpy"],
    );
    const getPairs = pairsOf(BTC);
    const opened = await paperCreateMarginOrder(
      {
        ...{ pair: "btc_jpy", side: "buy", positionSide: "long", type: "market", amount: "0.01" },
        ...{ statePath, getPairs, fetchCandles, nowMs: at },
      },
      tickerAt(1e7),
    );
    if (!opened.success) throw new Error(opened.error);
    const r = await runTick({ statePath, nowMs: at + 5 * MIN, fetchCandles, getPairs });
    if (!r.success) throw new Error(r.error);
    expect(r.data.margin?.events).toEqual([]);
    expect((await load()).margin.positions).toHaveLength(1);
  });

  it("the order gate refuses even the first margin order while the margin scan is behind now", () => {
    const lookup = marginParamsOf(BTC, T0);
    if (lookup.kind !== "ok") throw new Error(lookup.kind);
    const r = applyMarginOrder(stateAt(LAST, {}, { lastScanAt: LAST }), {
      ...{ pair: "btc_jpy", side: "buy", positionSide: "long", type: "market", amount: 0.01 },
      op: { label: "ロング新規建て（buy × long）", intent: "open" },
      params: new Map([["btc_jpy", lookup.params]]),
      prices: new Map([["btc_jpy", 1e7]]),
      ...{ nowMs: T0 + MIN, newId: () => "x" },
    });
    expect(!r.success && r.error).toContain("信用の状態を最新にできませんでした");
  });

  it("in the lock, candles before the fresh watermark are dropped (another tick scanned them meanwhile)", () => {
    // lock の外では LAST まで走査済みと読んで足を取ったが、その間に別の tick が +5 分まで走査し、建玉も建てた
    const state = stateAt(LAST, { balances: { jpy: 400_000 } });
    const fresh: PaperState = {
      ...state,
      margin: {
        ...state.margin,
        positions: [longPosition(iso(T0 + 5 * MIN))],
        lastScanAt: iso(T0 + 5 * MIN),
      },
    };
    const lookup = marginParamsOf(BTC, T0);
    if (lookup.kind !== "ok") throw new Error(lookup.kind);
    const candles = [
      { timestamp: T0 + MIN, open: 1e7, high: 1e7, low: 2_000_000, close: 2_000_000, vol: 1 },
      { timestamp: T0 + 6 * MIN, open: 1e7, high: 1e7, low: 1e7, close: 1e7, vol: 1 },
    ];
    const input = {
      candlesByPair: new Map([["btc_jpy", candles]]),
      params: new Map([["btc_jpy", lookup.params]]),
      candleFromMs: T0,
      periodMs: MIN,
      approximate: false,
    };
    const r = applyMarginTick(fresh, input, T0 + 10 * MIN, { newId: () => "x" });
    if (!r.success) throw new Error(r.error);
    expect(r.data.report.events).toEqual([]);
    expect(r.data.state.margin.positions).toHaveLength(1);
  });
});

describe("losscut report", () => {
  it("names the margin orders the losscut canceled", async () => {
    const order = {
      id: "m9",
      pair: "btc_jpy",
      side: "buy" as const,
      positionSide: "long" as const,
      type: "limit" as const,
      price: 1_000,
      amount: 0.01,
      createdAt: LAST,
    };
    await seedState(
      statePath,
      stateAt(LAST, {}, { positions: [longPosition(LAST)], orders: [order] }),
    );
    const r = await runTick({
      statePath,
      nowMs: T0 + 10 * MIN,
      fetchCandles: candlesOf([[T0 + MIN, 2_000_000, 1e7]]),
      getPairs: pairsOf(BTC),
    });
    if (!r.success) throw new Error(r.error);
    expect(r.data.margin?.events).toEqual([
      { kind: "losscut", at: iso(T0 + MIN), reason: "below-losscut", canceled: ["m9"] },
    ]);
    expect((await load()).margin.orders).toEqual([]);
  });
});
