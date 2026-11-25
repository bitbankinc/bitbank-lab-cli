// 100行超: paper create-margin-order の成行・指値と、受け付けない全経路（PARAM / 40167 / 停止 / 50061 / 50062 / 追証 / 不足金 / 状態が古い）を網羅
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { paperCreateMarginOrder } from "../../../commands/paper/create-margin-order.js";
import { paperInit } from "../../../commands/paper/init.js";
import { paperTick } from "../../../commands/paper/tick.js";
import type { Candle } from "../../../commands/public/candles-fetch.js";
import { EXIT } from "../../../exit-codes.js";
import type { CachedPair } from "../../../pairs-cache.js";
import type { FetchCandles } from "../../../paper-fill.js";
import { loadState, type PaperState, saveState } from "../../../paper-state.js";
import { MOCK_PAIRS } from "../../test-helpers.js";

const P = Date.parse;
const MIN = 60_000;
const T0 = P("2026-11-02T00:00:00Z"); // 09:00 JST

const BTC: CachedPair = {
  ...MOCK_PAIRS[0],
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
const LTC: CachedPair = {
  ...MOCK_PAIRS[0],
  name: "ltc_jpy",
  base_asset: "ltc",
  margin_current_individual_ratio: null,
  margin_long_interest: null,
  stop_margin_long_order: false,
  stop_margin_short_order: false,
};

let dir: string;
let statePath: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "paper-cmo-"));
  statePath = join(dir, "paper-state.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function tickers(last: number): { fetch: typeof fetch; retries: number } {
  const body = (l: string) => ({
    success: 1,
    data: { sell: l, buy: l, high: l, low: l, open: l, last: l, vol: "1", timestamp: 1 },
  });
  return { fetch: async () => new Response(JSON.stringify(body(String(last)))), retries: 0 };
}

function flat(price: number, ...times: number[]): FetchCandles {
  return async (_pair, from, to) => ({
    success: true,
    data: times
      .map(
        (t): Candle => ({
          timestamp: t,
          open: price,
          high: price,
          low: price,
          close: price,
          vol: 1,
        }),
      )
      .filter((c) => c.timestamp >= from && c.timestamp <= to),
  });
}

const pairsWith =
  (btc: Partial<CachedPair> = {}) =>
  async () => ({ success: true as const, data: [{ ...BTC, ...btc }, LTC] });

type Over = Partial<Parameters<typeof paperCreateMarginOrder>[0]>;
function order(over: Over, last = 10_000_000) {
  return paperCreateMarginOrder(
    {
      pair: "btc_jpy",
      side: "buy",
      positionSide: "long",
      type: "market",
      amount: "0.01",
      statePath,
      getPairs: pairsWith(),
      fetchCandles: flat(last, T0 + MIN),
      nowMs: T0,
      ...over,
    },
    tickers(last),
  );
}

async function state(): Promise<PaperState> {
  const r = await loadState(statePath);
  if (!r.success || !r.data) throw new Error("no state");
  return r.data;
}

async function patch(f: (s: PaperState) => PaperState) {
  await saveState(f(await state()), statePath);
}

describe("paper create-margin-order: market", () => {
  beforeEach(async () => {
    await paperInit({ jpy: "1000000", statePath });
  });

  it("opens a long at last with the open taker fee piled on the position (JPY untouched)", async () => {
    const r = await order({});
    if (!r.success || !("fill" in r.data)) throw new Error(JSON.stringify(r));
    expect(r.data.operation).toEqual({ label: "ロング新規建て（buy × long）", intent: "open" });
    expect(r.data.fill).toMatchObject({
      type: "market",
      fillPrice: 10_000_000,
      feeOccurred: 100,
      feeCharged: 0,
      profitLoss: 0,
    });
    expect(r.data.position).toMatchObject({
      openAmount: 0.01,
      product: 100_000,
      unrealizedFee: 100,
    });
    expect(r.data.jpy).toBe(1_000_000);
    expect(r.meta?.statePath).toBe(statePath);
  });

  it("closes at a higher price: profit net of the open + close fees goes to JPY", async () => {
    await order({});
    const r = await order(
      { side: "sell", nowMs: T0 + 5 * MIN, fetchCandles: flat(10_000_000, T0 + MIN) },
      11_000_000,
    );
    if (!r.success || !("fill" in r.data)) throw new Error(JSON.stringify(r));
    expect(r.data.operation.label).toBe("ロング返済（sell × long）");
    // (11,000,000 − 10,000,000) × 0.01 − (100 + 110)
    expect(r.data.fill).toMatchObject({
      feeOccurred: 110,
      feeCharged: 210,
      profitLoss: 9_790,
      interest: 0,
    });
    expect(r.data.position).toBe(null);
    expect(r.data.jpy).toBe(1_009_790);
    expect((await state()).margin.history).toHaveLength(2);
  });

  it("charges the interest accrued across a JST midnight on the close", async () => {
    await order({});
    const later = P("2026-11-02T16:00:00Z"); // 01:00 JST 翌日
    const r = await order({
      side: "sell",
      nowMs: later,
      fetchCandles: flat(10_000_000, later - MIN),
    });
    if (!r.success || !("fill" in r.data)) throw new Error(JSON.stringify(r));
    expect(r.data.fill.interest).toBeCloseTo(40, 10); // 100,000 × 0.0004 × 1 回
  });
});

describe("paper create-margin-order: limit", () => {
  it("places the order, and a later tick fills it when the candle reaches the price", async () => {
    await paperInit({ jpy: "1000000", statePath });
    const placed = await order({ type: "limit", price: "9900000" });
    if (!placed.success || !("placed" in placed.data)) throw new Error(JSON.stringify(placed));
    expect((await state()).margin.orders).toHaveLength(1);
    const dip: FetchCandles = async () => ({
      success: true,
      data: [
        { timestamp: T0 + MIN, open: 1e7, high: 1e7, low: 9_800_000, close: 9_900_000, vol: 1 },
      ],
    });
    const t = await paperTick({
      statePath,
      nowMs: T0 + 5 * MIN,
      fetchCandles: dip,
      getPairs: pairsWith(),
    });
    if (!t.success) throw new Error(t.error);
    expect(t.data.margin?.filled[0]).toMatchObject({
      id: placed.data.placed.id,
      type: "limit",
      fillPrice: 9_900_000,
    });
    expect((await state()).margin.positions[0]).toMatchObject({
      openAmount: 0.01,
      product: 99_000,
    });
  });
});

describe("paper create-margin-order: other pairs in the book", () => {
  it("a pending order on another pair does not break a market close (its risk ratio is fetched too)", async () => {
    // 実 API での確認（SKILL.md の例）で見つかった回帰: ETH のショート指値があると BTC の返済が
    // "missing risk ratio of eth_jpy" で失敗していた（約定時必要保証金に注文のペアの比率が要る）
    await paperInit({ jpy: "1000000", statePath });
    const ETH: CachedPair = { ...BTC, name: "eth_jpy", base_asset: "eth" };
    const getPairs = async () => ({ success: true as const, data: [BTC, ETH, LTC] });
    expect((await order({ getPairs })).success).toBe(true);
    const placed = await order({
      getPairs,
      pair: "eth_jpy",
      side: "sell",
      positionSide: "short",
      type: "limit",
      price: "20000000",
      amount: "0.01",
      nowMs: T0 + 2 * MIN, // 足（T0 + 1 分）より後にして、裏の tick が足を見つけられるようにする
    });
    expect(placed.success).toBe(true);
    const close = await order({ getPairs, side: "sell", intent: "close", nowMs: T0 + 5 * MIN });
    if (!close.success || !("fill" in close.data)) throw new Error(JSON.stringify(close));
    expect(close.data.position).toBe(null);
  });
});

describe("paper create-margin-order: rejections", () => {
  beforeEach(async () => {
    await paperInit({ jpy: "1000000", statePath });
  });

  it.each([
    ["missing --position-side", { positionSide: undefined }],
    ["an unsupported type (stop)", { type: "stop" }],
    ["limit without price", { type: "limit" }],
    ["--intent that contradicts side × position-side", { intent: "close" }],
  ])("PARAM for %s", async (_label, over) => {
    const r = await order(over as Over);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.exitCode).toBe(EXIT.PARAM);
  });

  it("PARAM for a pair without margin (40167 in production)", async () => {
    const r = await order({ pair: "ltc_jpy" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.exitCode).toBe(EXIT.PARAM);
      expect(r.error).toContain("40167");
    }
  });

  it("a stopped long blocks new longs (50083) but not closing an existing long", async () => {
    await order({});
    const stopped = { getPairs: pairsWith({ stop_margin_long_order: true }), nowMs: T0 + 5 * MIN };
    const open = await order(stopped);
    expect(!open.success && open.error).toContain("50083");
    expect((await order({ ...stopped, side: "sell" })).success).toBe(true);
  });

  it("rejects an open beyond the margin capacity (50061) and leaves the state as it was", async () => {
    const r = await order({ amount: "0.3" }); // 必要保証金 1,500,000 > 受入保証金 1,000,000
    expect(!r.success && r.error).toContain("50061");
    expect((await state()).margin.positions).toEqual([]);
  });

  it("rejects closing more than the closable amount (50062)", async () => {
    await order({});
    const r = await order({ side: "sell", amount: "0.02", nowMs: T0 + 5 * MIN });
    expect(!r.success && r.error).toContain("50062");
  });

  it("during a margin call: opens are refused, a close that restores B ≥ Mm resolves it", async () => {
    await order({ amount: "0.1" });
    await patch((s) => ({
      ...s,
      margin: {
        ...s.margin,
        call: {
          judgedAt: new Date(T0).toISOString(),
          deadline: new Date(T0 + 86_400_000).toISOString(),
          amount: 1,
        },
      },
    }));
    const later = { nowMs: T0 + 5 * MIN };
    const open = await order({ ...later, amount: "0.0001" });
    expect(!open.success && open.error).toContain("追証が発生中");
    const close = await order({ ...later, side: "sell", amount: "0.05" });
    if (!close.success || !("fill" in close.data)) throw new Error(JSON.stringify(close));
    expect(close.data.marginCallResolved).toBe(true);
    expect((await state()).margin.call).toBe(null);
  });

  it("while there is a shortfall (negative JPY), refuses opens but still lets a remaining position be closed", async () => {
    // 損の大きい建玉の返済で JPY が負になり、別の建玉が残った場面。残りを返済できないと paper reset しか手が無くなる
    // 含み益のある建玉（10,000,000 → 20,000,000）が残るので、JPY が負でも B は強制決済の基準を上回る
    await order({});
    await patch((s) => ({ ...s, balances: { jpy: -5_000 } }));
    const later = { nowMs: T0 + 5 * MIN, fetchCandles: flat(20_000_000, T0 + MIN) };
    const open = await order({ ...later, amount: "0.0001" }, 20_000_000);
    expect(!open.success && open.error).toContain("不足金");
    const close = await order({ ...later, side: "sell" }, 20_000_000);
    if (!close.success || !("fill" in close.data)) throw new Error(JSON.stringify(close));
    expect(close.data.position).toBe(null);
  });

  it("refuses when the lazy tick could not bring the margin state up to now", async () => {
    await order({});
    const failing: FetchCandles = async () => ({ success: false, error: "boom" });
    const r = await order({ nowMs: T0 + 5 * MIN, fetchCandles: failing, amount: "0.0001" });
    expect(!r.success && r.error).toContain("信用の状態を最新にできませんでした");
  });
});

it("errors when the paper account is not initialized", async () => {
  const r = await order({});
  expect(!r.success && r.error).toContain("not initialized");
});
