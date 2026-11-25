import { describe, expect, it } from "vitest";
import type { Candle } from "../../../commands/public/candles-fetch.js";
import { DEFAULT_MARGIN_RULES } from "../../../paper-margin/assumptions.js";
import type { MarginPairParams } from "../../../paper-margin/params.js";
import { type ScanInput, scanMargin } from "../../../paper-margin/scan.js";
import type { MarginBook, MarginOrder, MarginPosition } from "../../../paper-margin/state.js";

const P = Date.parse;
const MIN = 60_000;
const FROM = P("2026-11-02T00:00:00Z"); // 09:00 JST
const CALL1 = P("2026-11-02T06:00:00Z"); // 15:00 JST（追証の基準時）
const MIDNIGHT = P("2026-11-02T15:00:00Z"); // 00:00 JST（利息）
const CALL2 = P("2026-11-03T06:00:00Z"); // 翌日 15:00 JST = CALL1 の解消期限

const BTC: MarginPairParams = {
  pair: "btc_jpy",
  riskRatio: 0.5,
  riskRatioUntilMs: 253402300799999,
  riskRatioSource: "current",
  fee: { openMaker: 0, openTaker: 0.001, closeMaker: 0, closeTaker: 0.001 },
  interestPerDay: { long: 0.0004, short: 0.0004 },
  stopNewLong: false,
  stopNewShort: false,
};

function candle(ts: number, low: number, high: number, close = low): Candle {
  return { timestamp: ts, open: high, high, low, close, vol: 1 };
}

function position(over: Partial<MarginPosition> = {}): MarginPosition {
  const at = new Date(FROM).toISOString();
  return {
    pair: "btc_jpy",
    positionSide: "long",
    openAmount: 0.1,
    product: 1_000_000, // 平均建値 10,000,000
    unrealizedFee: 0,
    unrealizedInterest: 0,
    openedAt: at,
    lastInterestAt: at,
    ...over,
  };
}

function order(over: Partial<MarginOrder>): MarginOrder {
  return {
    id: "o1",
    pair: "btc_jpy",
    side: "sell",
    positionSide: "long",
    type: "limit",
    price: 9_000_000,
    amount: 0.1,
    createdAt: new Date(FROM).toISOString(),
    ...over,
  };
}

function scan(book: Partial<MarginBook>, candles: Candle[], toMs: number, pair = "btc_jpy") {
  const input: ScanInput = {
    book: { jpy: 1_000_000, positions: [position()], orders: [], call: null, ...book },
    candlesByPair: new Map([[pair, candles]]),
    params: new Map([["btc_jpy", BTC]]),
    rules: DEFAULT_MARGIN_RULES,
    fromMs: FROM,
    toMs,
  };
  const r = scanMargin(input);
  if (!r.success) throw new Error(r.error);
  return r.data;
}

describe("scanMargin", () => {
  it("does nothing on a quiet window except moving lastInterestAt", () => {
    const flat = [candle(FROM + MIN, 1e7, 1e7), candle(FROM + 2 * MIN, 1e7, 1e7)];
    const r = scan({}, flat, FROM + 10 * MIN);
    expect(r.events).toEqual([]);
    expect(r.book.positions[0].lastInterestAt).toBe(new Date(FROM + 10 * MIN).toISOString());
  });

  it("force-closes on the crash minute at its low and cancels margin orders", () => {
    const r = scan(
      { orders: [order({ price: 12_000_000 })] },
      [candle(FROM + MIN, 2_000_000, 1e7)],
      FROM + 10 * MIN,
    );
    expect(r.events.map((e) => e.kind)).toEqual(["losscut"]);
    const lc = r.events[0];
    if (lc.kind !== "losscut") throw new Error();
    expect(lc.reason).toBe("below-losscut");
    expect(lc.closes[0].price).toBe(2_000_000);
    expect(lc.canceled.map((o) => o.id)).toEqual(["o1"]);
    expect(r.book.positions).toEqual([]);
    expect(r.book.jpy).toBeCloseTo(1_000_000 - 800_000 - 200, 4); // 値幅損 − taker 手数料
  });

  it("raises a margin call at 15:00 JST and force-closes at the 24h deadline", () => {
    // 4,800,000 では B 480,000 < Mm 500,000（追証）だが > 250,000（強制決済しない）
    const r = scan({}, [candle(FROM + MIN, 4_800_000, 4_800_000)], CALL2 + 3600_000);
    expect(r.events.map((e) => e.kind)).toEqual(["margin-call", "losscut"]);
    const [call, lc] = r.events;
    if (call.kind !== "margin-call" || lc.kind !== "losscut") throw new Error();
    expect(call.call).toEqual({
      judgedAt: "2026-11-02T06:00:00.000Z",
      deadline: "2026-11-03T06:00:00.000Z",
      amount: 20_000,
    });
    expect(lc).toMatchObject({ at: "2026-11-03T06:00:00.000Z", reason: "margin-call-expired" });
    expect(r.interest.map((c) => c.atMs)).toEqual([MIDNIGHT]); // 期限までに JST 0 時を 1 回
    expect(r.book.jpy).toBeCloseTo(1_000_000 - 520_000 - 480 - 400, 4);
  });

  it("a close fill that restores B ≥ Mm resolves the margin call", () => {
    const candles = [
      candle(FROM + MIN, 4_800_000, 4_800_000),
      candle(CALL1 + MIN, 4_800_000, 5_000_000, 4_900_000),
    ];
    const r = scan(
      { orders: [order({ price: 5_000_000, amount: 0.08 })] },
      candles,
      CALL2 + 3600_000,
    );
    expect(r.events.map((e) => e.kind)).toEqual(["margin-call", "fill", "margin-call-resolved"]);
    expect(r.book.call).toBe(null);
    expect(r.book.positions[0].openAmount).toBeCloseTo(0.02, 12);
  });

  it("price recovery alone does not resolve it: still force-closed at the deadline", () => {
    const candles = [
      candle(FROM + MIN, 4_800_000, 4_800_000),
      candle(CALL1 + 3600_000, 9_000_000, 9_000_000),
      candle(CALL2, 9_000_000, 9_000_000),
    ];
    const r = scan({}, candles, CALL2 + 3600_000);
    expect(r.events.map((e) => e.kind)).toEqual(["margin-call", "losscut"]);
    const lc = r.events[1];
    if (lc.kind !== "losscut") throw new Error();
    expect(lc.reason).toBe("margin-call-expired");
    expect(lc.closes[0].price).toBe(9_000_000);
  });

  it("within one candle, an open fill comes before the losscut check", () => {
    const r = scan(
      { positions: [], orders: [order({ side: "buy", price: 1e7, amount: 0.2 })] },
      [candle(FROM + MIN, 7_400_000, 1e7)],
      FROM + 10 * MIN,
    );
    // 建玉 2,000,000 を安値で評価: B 480,000 < Mm 1,000,000 × 0.5
    expect(r.events.map((e) => e.kind)).toEqual(["fill", "losscut"]);
    expect(r.book.jpy).toBeCloseTo(1_000_000 - 520_000 - 1_480, 4);
  });

  it("within one candle, the losscut check comes before a close fill", () => {
    const r = scan(
      { orders: [order({ price: 9_000_000 })] },
      [candle(FROM + MIN, 2_000_000, 9_000_000)],
      FROM + 10 * MIN,
    );
    expect(r.events.map((e) => e.kind)).toEqual(["losscut"]);
  });

  it("a hedge is not force-closed by a wide candle (no double counting of both extremes)", () => {
    const hedge = [position(), position({ positionSide: "short" })];
    const r = scan(
      { positions: hedge },
      [candle(FROM + MIN, 5_000_000, 15_000_000)],
      FROM + 10 * MIN,
    );
    expect(r.events).toEqual([]);
  });

  it("does not fill an order in a candle before it was placed", () => {
    const late = order({
      side: "buy",
      price: 1e7,
      amount: 0.01,
      createdAt: new Date(FROM + 5 * MIN).toISOString(),
    });
    const r = scan(
      { positions: [], orders: [late] },
      [candle(FROM + MIN, 9e6, 1e7)],
      FROM + 10 * MIN,
    );
    expect(r.events).toEqual([]);
    expect(r.book.orders).toEqual([late]);
  });

  it("charges interest for a JST midnight after the last candle", () => {
    const r = scan({}, [candle(FROM + MIN, 1e7, 1e7)], MIDNIGHT + 3600_000);
    expect(r.book.positions[0].unrealizedInterest).toBeCloseTo(400, 10);
  });

  it("works the same with coarse (4hour) candles", () => {
    const r = scan({}, [candle(FROM, 2_000_000, 1e7)], FROM + 4 * 3600_000);
    expect(r.events.map((e) => e.kind)).toEqual(["losscut"]);
  });

  it("a deadline that is not a candle or 15:00 time is still processed on time", () => {
    // 猶予 2 時間: 期限 08:00Z は足の時刻でも JST 15 時でもない。走査中に時間軸へ差し込む必要がある
    const input: ScanInput = {
      book: { jpy: 1_000_000, positions: [position()], orders: [], call: null },
      candlesByPair: new Map([["btc_jpy", [candle(FROM + MIN, 4_800_000, 4_800_000)]]]),
      params: new Map([["btc_jpy", BTC]]),
      rules: { ...DEFAULT_MARGIN_RULES, marginCallGraceMs: 2 * 3600_000 },
      fromMs: FROM,
      toMs: CALL1 + 5 * 3600_000,
    };
    const r = scanMargin(input);
    if (!r.success) throw new Error(r.error);
    expect(r.data.events.map((e) => e.kind)).toEqual(["margin-call", "losscut"]);
    expect(r.data.events[1]).toMatchObject({
      at: "2026-11-02T08:00:00.000Z",
      reason: "margin-call-expired",
    });
  });

  it("fails when a pair with positions has no candles (never skips the check silently)", () => {
    const input: ScanInput = {
      book: { jpy: 1_000_000, positions: [position({ pair: "eth_jpy" })], orders: [], call: null },
      candlesByPair: new Map(),
      params: new Map([["btc_jpy", BTC]]),
      rules: DEFAULT_MARGIN_RULES,
      fromMs: FROM,
      toMs: FROM + MIN,
    };
    const r = scanMargin(input);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("no candles for eth_jpy");
  });
});
