// 100行超: 追証の解消の行為としての現物の売却（lazy tick の指値の売り・paper create-order の成行の売り）を、
// 数える売り・数えない売り（基準時より前・JPY 以外・状態が古い）の両側から検査する
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { paperCreateOrder } from "../../../commands/paper/create-order.js";
import type { Candle } from "../../../commands/public/candles-fetch.js";
import { type FetchCandles, runTick } from "../../../paper-fill.js";
import { marginParamsOf } from "../../../paper-margin/params.js";
import { applyMarginTick } from "../../../paper-margin/tick.js";
import { loadState, type PaperHistoryEntry, type PaperState } from "../../../paper-state.js";
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
const CALL = { judgedAt: LAST, deadline: "2026-11-03T00:00:00.000Z", amount: 110_000 };

/** 現物の約定履歴の 1 行（JPY 建ての指値。手数料 0） */
function spotFill(over: Partial<PaperHistoryEntry>): PaperHistoryEntry {
  return {
    ...{ id: "s1", pair: "btc_jpy", side: "sell", type: "limit", amount: 0.02 },
    ...{ fillPrice: 9_900_000, feeQuote: 0, filledAt: iso(T0 + 6 * MIN) },
    ...over,
  };
}

describe("spot sales in the margin scan window (applyMarginTick, from the spot history)", () => {
  const lookup = marginParamsOf(BTC, T0);
  if (lookup.kind !== "ok") throw new Error(lookup.kind);
  const flatAt = (ts: number, px: number) => ({
    timestamp: ts,
    ...{ open: px, high: px, low: px, close: px, vol: 1 },
  });
  const input = (candles: Candle[]) => ({
    candlesByPair: new Map([["btc_jpy", candles]]),
    params: new Map([["btc_jpy", lookup.params]]),
    ...{ candleFromMs: T0, periodMs: MIN, approximate: false },
  });
  // JPY 600,000（売りの代金 198,000 を含む）・ロング 0.1 @ 10,000,000・価格 9,900,000 → 売った後の B 590,000 ≥ Mm 500,000
  const run = (history: PaperHistoryEntry[], judgedAt = iso(T0 + 5 * MIN)) => {
    const state = stateAt(
      LAST,
      { balances: { jpy: 600_000 }, history },
      { positions: [longPosition(LAST)], call: { ...CALL, judgedAt } },
    );
    const candles = [flatAt(T0 + 5 * MIN, 9_900_000), flatAt(T0 + 9 * MIN, 9_900_000)];
    const r = applyMarginTick(state, input(candles), T0 + 10 * MIN, { newId: () => "x" });
    if (!r.success) throw new Error(r.error);
    return r.data;
  };

  it("resolves the call at the time of a JPY limit sale made after the judgment", () => {
    const r = run([spotFill({})]);
    expect(r.state.margin.call).toBe(null);
    expect(r.report.events).toEqual([{ kind: "margin-call-resolved", at: iso(T0 + 6 * MIN) }]);
  });

  it("does not count a sale from before the call was judged (price recovery alone does not resolve)", () => {
    expect(run([spotFill({ filledAt: iso(T0 + 2 * MIN) })]).state.margin.call).not.toBe(null);
  });

  it("does not count a non-JPY sale or a buy", () => {
    expect(run([spotFill({ pair: "eth_btc" })]).state.margin.call).not.toBe(null);
    expect(run([spotFill({ side: "buy" })]).state.margin.call).not.toBe(null);
  });

  it("counts a market sale too, at its time (in case it could not be judged when it was made)", () => {
    expect(run([spotFill({ type: "market" })]).state.margin.call).toBe(null);
  });

  it("does not count the sale proceeds before the sale (a losscut before it still happens)", () => {
    // JPY 500,000 は +200,000 の売り（+8 分）を含む。+2 分の安値 9,400,000 で、売る前の B は 300,000 − 60,000 = 240,000 で
    // 強制決済の基準（Mm 500,000 × 0.5 = 250,000）を割る。代金を先に数えると 440,000 で見逃していた
    const state = stateAt(
      LAST,
      {
        balances: { jpy: 500_000 },
        history: [spotFill({ amount: 0.02, fillPrice: 1e7, filledAt: iso(T0 + 8 * MIN) })],
      },
      { positions: [longPosition(LAST)] },
    );
    const crash = {
      timestamp: T0 + 2 * MIN,
      open: 1e7,
      high: 1e7,
      low: 9_400_000,
      close: 1e7,
      vol: 1,
    };
    const r = applyMarginTick(state, input([crash]), T0 + 10 * MIN, { newId: () => "x" });
    if (!r.success) throw new Error(r.error);
    expect(r.data.report.events.map((e) => e.kind)).toEqual(["losscut"]);
  });
});

describe("the JPY of a later spot sale, rebuilt from the history", () => {
  it("is over- rather than under-estimated, so a losscut right at the threshold before it is not missed", () => {
    // 代金 1,000.4 円・丸める前の手数料 0.60024 円 → 実際の受取は round(999.79976) = 1,000 円、履歴の手数料は 1 円。
    // 売る前の JPY 249,999.8 円は基準 250,000 円を割る。履歴から 1,000.4 − 1 = 999.4 円と戻すと 250,000.4 円で見逃す
    const lookup = marginParamsOf(BTC, T0);
    if (lookup.kind !== "ok") throw new Error(lookup.kind);
    const sale = spotFill({
      amount: 0.0001,
      fillPrice: 10_004_000,
      feeQuote: 1,
      filledAt: iso(T0 + 8 * MIN),
    });
    const state = stateAt(
      LAST,
      { balances: { jpy: 250_999.8 }, history: [sale] },
      { positions: [longPosition(LAST)] },
    );
    const flat = { timestamp: T0 + 2 * MIN, open: 1e7, high: 1e7, low: 1e7, close: 1e7, vol: 1 };
    const input = {
      candlesByPair: new Map([["btc_jpy", [flat]]]),
      params: new Map([["btc_jpy", lookup.params]]),
      ...{ candleFromMs: T0, periodMs: MIN, approximate: false },
    };
    const r = applyMarginTick(state, input, T0 + 10 * MIN, { newId: () => "x" });
    if (!r.success) throw new Error(r.error);
    expect(r.data.report.events.map((e) => e.kind)).toEqual(["losscut"]);
  });
});

describe("a spot sale filled while the margin scan was failing", () => {
  let dir: string;
  let statePath: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "paper-spot-sale-retry-"));
    statePath = join(dir, "paper-state.json");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("still resolves the call on the next tick that can scan", async () => {
    // xrp の売り指値（+200,000 JPY）が約定した tick では btc の足が取れず、信用を走査できない
    const xrpSell = {
      ...{ id: "x1", pair: "xrp_jpy", side: "sell" as const, type: "limit" as const },
      ...{ price: 1_000, amount: 200, createdAt: LAST },
    };
    const s = stateAt(LAST, { balances: { jpy: 400_000, xrp: 200 }, openOrders: [xrpSell] });
    await seedState(statePath, {
      ...s,
      margin: { ...s.margin, positions: [longPosition(LAST)], call: CALL },
    });
    const list: Array<[number, number, number]> = [[T0 + MIN, 9_900_000, 9_900_000]];
    const xrp = candlesOf([[T0 + MIN, 1_000, 1_000]]);
    const btcFailing: FetchCandles = async (pair, from, to) =>
      pair === "btc_jpy" ? { success: false, error: "boom" } : xrp(pair, from, to);
    const common = { statePath, getPairs: pairsOf(BTC), feeRate: 0 };
    const first = await runTick({ ...common, nowMs: T0 + 10 * MIN, fetchCandles: btcFailing });
    if (!first.success) throw new Error(first.error);
    expect(first.data.filled.map((f) => f.id)).toEqual(["x1"]);
    const both: FetchCandles = async (pair, from, to) =>
      pair === "btc_jpy" ? candlesOf(list)(pair, from, to) : xrp(pair, from, to);
    const second = await runTick({ ...common, nowMs: T0 + 20 * MIN, fetchCandles: both });
    if (!second.success) throw new Error(second.error);
    expect(second.data.margin?.events.map((e) => e.kind)).toEqual(["margin-call-resolved"]);
    const r = await loadState(statePath);
    expect(r.success && r.data?.margin.call).toBe(null);
  });
});

describe("paper create-order: a spot market sell during a margin call", () => {
  let dir: string;
  let statePath: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "paper-spot-sale-"));
    statePath = join(dir, "paper-state.json");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  // JPY 400,000・現物 0.02 BTC・ロング 0.1 @ 10,000,000・価格 9,900,000 → B 390,000 < Mm 500,000（追証中）
  async function seed() {
    const s = stateAt(LAST, { balances: { jpy: 400_000, btc: 0.02 } });
    await seedState(statePath, {
      ...s,
      margin: { ...s.margin, positions: [longPosition(LAST)], call: CALL },
    });
  }
  const sell = (over: Partial<Parameters<typeof paperCreateOrder>[0]> = {}) =>
    paperCreateOrder(
      {
        ...{ pair: "btc_jpy", side: "sell", type: "market", amount: "0.02", statePath },
        ...{ getPairs: pairsOf(BTC), nowMs: T0 + 10 * MIN },
        fetchCandles: candlesOf([[T0 + MIN, 9_900_000, 9_900_000]]),
        ...over,
      },
      tickerAt(9_900_000),
    );
  const call = async (): Promise<PaperState["margin"]["call"]> => {
    const r = await loadState(statePath);
    if (!r.success || !r.data) throw new Error("load failed");
    return r.data.margin.call;
  };

  it("resolves the call when the sale brings B ≥ Mm (JPY + 198,000 − taker fee)", async () => {
    await seed();
    const r = await sell();
    if (!r.success || !("fillPrice" in r.data)) throw new Error(JSON.stringify(r));
    expect(r.data.marginCallResolved).toBe(true);
    expect(await call()).toBe(null);
  });

  it("keeps the call when the sale is too small", async () => {
    await seed();
    const r = await sell({ amount: "0.001" });
    if (!r.success || !("fillPrice" in r.data)) throw new Error(JSON.stringify(r));
    expect(r.data.marginCallResolved).toBe(false);
    expect(await call()).toEqual(CALL);
  });

  it("does not resolve on a stale margin state (the lazy tick could not scan up to now)", async () => {
    await seed();
    const r = await sell({ fetchCandles: async () => ({ success: false, error: "boom" }) });
    if (!r.success || !("fillPrice" in r.data)) throw new Error(JSON.stringify(r));
    expect(r.data.marginCallResolved).toBe(false);
    expect(await call()).toEqual(CALL);
  });

  it("adds no marginCallResolved field when there is no margin call", async () => {
    await seedState(statePath, stateAt(LAST, { balances: { jpy: 400_000, btc: 0.02 } }));
    const r = await sell();
    expect(r.success && "marginCallResolved" in r.data).toBe(false);
  });
});

describe("spot sales that could not be judged right away", () => {
  let dir: string;
  let statePath: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "paper-spot-sale-late-"));
    statePath = join(dir, "paper-state.json");
  });
  afterEach(() => {
    vi.useRealTimers();
    rmSync(dir, { recursive: true, force: true });
  });

  // JPY 400,000・ロング 0.1 @ 10,000,000・価格 9,900,000 → B 390,000 < Mm 500,000（追証中）
  async function seedCall(over: Partial<PaperState> = {}, call = CALL) {
    const s = stateAt(LAST, { balances: { jpy: 400_000, btc: 0.02, xrp: 200 }, ...over });
    await seedState(statePath, {
      ...s,
      margin: { ...s.margin, positions: [longPosition(LAST)], call, lastScanAt: LAST },
    });
  }
  const btc = candlesOf([[T0 + MIN, 9_900_000, 9_900_000]]);
  const xrp = candlesOf([[T0 + MIN, 1_000, 1_000]]);
  const fetchWhere =
    (ok: { btc: boolean; xrp: boolean }): FetchCandles =>
    async (pair, from, to) => {
      const good = pair === "btc_jpy" ? ok.btc : ok.xrp;
      if (!good) return { success: false, error: `no candles for ${pair}` };
      return (pair === "btc_jpy" ? btc : xrp)(pair, from, to);
    };
  const xrpSell = {
    ...{ id: "x1", pair: "xrp_jpy", side: "sell" as const, type: "limit" as const },
    ...{ price: 1_000, amount: 200, createdAt: LAST },
  };
  const tick = (nowMs: number, ok: { btc: boolean; xrp: boolean }) =>
    runTick({ statePath, nowMs, getPairs: pairsOf(BTC), feeRate: 0, fetchCandles: fetchWhere(ok) });
  const call = async () => {
    const r = await loadState(statePath);
    if (!r.success || !r.data) throw new Error("load failed");
    return r.data.margin;
  };

  it("a market sale made on a stale margin state is judged by the next scan, at the time it was made", async () => {
    await seedCall();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(T0 + 10 * MIN)); // 約定時刻（nowIso）を T0 + 10 分にする
    const sold = await paperCreateOrder(
      {
        ...{ pair: "btc_jpy", side: "sell", type: "market", amount: "0.02", statePath },
        ...{
          getPairs: pairsOf(BTC),
          nowMs: T0 + 10 * MIN,
          fetchCandles: fetchWhere({ btc: false, xrp: true }),
        },
      },
      tickerAt(9_900_000),
    );
    if (!sold.success || !("fillPrice" in sold.data)) throw new Error(JSON.stringify(sold));
    expect(sold.data.marginCallResolved).toBe(false); // 信用の状態が古いので、その場では判定できない
    vi.useRealTimers();
    const r = await tick(T0 + 20 * MIN, { btc: true, xrp: true });
    if (!r.success) throw new Error(r.error);
    expect(r.data.margin?.events).toEqual([
      { kind: "margin-call-resolved", at: iso(T0 + 10 * MIN) },
    ]);
  });

  it("a limit sale confirmed after the margin scan already passed its time is judged at the window start", async () => {
    // 1 回目: xrp の足だけ取れず、信用は T0 + 10 分まで走査済み。2 回目で xrp の売り（約定 T0 + 2 分）が確定する
    await seedCall({ openOrders: [xrpSell] });
    const first = await tick(T0 + 10 * MIN, { btc: true, xrp: false });
    if (!first.success) throw new Error(first.error);
    expect((await call()).lastScanAt).toBe(iso(T0 + 10 * MIN));
    const second = await tick(T0 + 20 * MIN, { btc: true, xrp: true });
    if (!second.success) throw new Error(second.error);
    expect(second.data.filled.map((f) => f.id)).toEqual(["x1"]);
    expect(second.data.margin?.events).toEqual([
      { kind: "margin-call-resolved", at: iso(T0 + 10 * MIN) },
    ]);
  });

  it("does not count such a late sale when it was filled before the call was judged (only the time is moved)", async () => {
    // 追証の基準時は T0 + 5 分、xrp の売りは T0 + 2 分。窓の頭（T0 + 10 分）に寄せても、基準時より前の売りは数えない
    await seedCall({ openOrders: [xrpSell] }, { ...CALL, judgedAt: iso(T0 + 5 * MIN) });
    await tick(T0 + 10 * MIN, { btc: true, xrp: false });
    const r = await tick(T0 + 20 * MIN, { btc: true, xrp: true });
    if (!r.success) throw new Error(r.error);
    expect(r.data.filled.map((f) => f.id)).toEqual(["x1"]);
    expect(r.data.margin?.events).toEqual([]);
    expect((await call()).call).not.toBe(null);
  });

  it("keeps such a sale pending while the margin scan keeps failing, and judges it once a scan succeeds", async () => {
    await seedCall({ openOrders: [xrpSell] });
    await tick(T0 + 10 * MIN, { btc: true, xrp: false }); // 信用だけ進む
    await tick(T0 + 20 * MIN, { btc: false, xrp: true }); // 売りは確定、信用は走査できない
    expect((await call()).pendingSpotSales).toEqual([iso(T0 + 2 * MIN)]);
    const r = await tick(T0 + 30 * MIN, { btc: true, xrp: true });
    if (!r.success) throw new Error(r.error);
    expect(r.data.margin?.events.map((e) => e.kind)).toEqual(["margin-call-resolved"]);
    expect((await call()).pendingSpotSales).toBeUndefined();
  });
});
