import { describe, expect, it } from "vitest";
import type { MarginAccount } from "../../../paper-margin/account.js";
import { applyOrderFill, orderHits } from "../../../paper-margin/fills.js";
import { executeLosscut, worstPrices } from "../../../paper-margin/losscut.js";
import {
  isMarginCallExpired,
  judgeMarginCall,
  resolvesMarginCall,
} from "../../../paper-margin/margin-call.js";
import type { MarginBook, MarginOrder, MarginPosition } from "../../../paper-margin/state.js";

const T0 = "2026-11-02T00:00:00.000Z";
const FEE = { openMaker: -0.0002, openTaker: 0.0012, closeMaker: -0.0002, closeTaker: 0.0012 };

function position(over: Partial<MarginPosition> = {}): MarginPosition {
  return {
    pair: "btc_jpy",
    positionSide: "long",
    openAmount: 0.1,
    product: 1_000_000,
    unrealizedFee: 0,
    unrealizedInterest: 0,
    openedAt: T0,
    lastInterestAt: T0,
    ...over,
  };
}

function order(over: Partial<MarginOrder> = {}): MarginOrder {
  return {
    id: "o1",
    pair: "btc_jpy",
    side: "sell",
    positionSide: "long",
    type: "limit",
    price: 11_000_000,
    amount: 0.05,
    createdAt: T0,
    ...over,
  };
}

function ok<T>(r: { success: true; data: T } | { success: false; error: string }): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

const range = (low: number, high: number) => new Map([["btc_jpy", { low, high }]]);

describe("worstPrices", () => {
  it("long → low, short → high", () => {
    expect(ok(worstPrices([position()], range(9e6, 11e6))).get("btc_jpy")).toBe(9e6);
    expect(
      ok(worstPrices([position({ positionSide: "short" })], range(9e6, 11e6))).get("btc_jpy"),
    ).toBe(11e6);
  });

  it("a hedge picks whichever extreme is worse for the net position", () => {
    const hedge = [
      position(),
      position({ positionSide: "short", openAmount: 0.2, product: 2_000_000 }),
    ];
    expect(ok(worstPrices(hedge, range(9e6, 11e6))).get("btc_jpy")).toBe(11e6); // ネットはショート
  });

  it("fails when a pair with positions has no price range", () => {
    expect(worstPrices([position({ pair: "eth_jpy" })], range(9e6, 11e6)).success).toBe(false);
  });
});

describe("executeLosscut", () => {
  it("closes every position at the given price with the close taker fee and cancels margin orders", () => {
    const book: MarginBook = {
      jpy: 1_000_000,
      positions: [
        position(),
        position({ pair: "eth_jpy", positionSide: "short", openAmount: 1, product: 500_000 }),
      ],
      orders: [order(), order({ id: "o2", side: "buy", positionSide: "short", pair: "eth_jpy" })],
      call: { judgedAt: T0, deadline: "2026-11-03T00:00:00.000Z", amount: 1 },
    };
    const prices = new Map([
      ["btc_jpy", 2_000_000],
      ["eth_jpy", 600_000],
    ]);
    const r = ok(executeLosscut(book, prices, () => 0.0012, T0));
    expect(r.book.positions).toEqual([]);
    expect(r.book.orders).toEqual([]);
    expect(r.book.call).toBe(null);
    expect(r.canceled.map((o) => o.id)).toEqual(["o1", "o2"]);
    // btc: (2,000,000 − 10,000,000) × 0.1 − 240 / eth: (500,000 − 600,000) × 1 − 720
    expect(r.closes.map((c) => c.fee)).toEqual([240, 720]);
    expect(r.book.jpy).toBeCloseTo(1_000_000 - 800_240 - 100_720, 4);
  });

  it("can leave a negative JPY balance (a shortfall)", () => {
    const book: MarginBook = { jpy: 100_000, positions: [position()], orders: [], call: null };
    const r = ok(executeLosscut(book, new Map([["btc_jpy", 8_000_000]]), () => 0, T0));
    expect(r.book.jpy).toBeCloseTo(-100_000, 6);
  });

  it("fails without a close taker rate", () => {
    const book: MarginBook = { jpy: 0, positions: [position()], orders: [], call: null };
    expect(executeLosscut(book, new Map([["btc_jpy", 1]]), () => undefined, T0).success).toBe(
      false,
    );
  });
});

describe("margin call", () => {
  const account = (balance: number, maintenance: number): MarginAccount => ({
    collateral: balance,
    openPositionProduct: maintenance * 2,
    positionProfitLoss: 0,
    unrealizedCost: 0,
    totalMarginBalance: balance,
    positionMaintenanceMargin: maintenance,
    openOrderProduct: 0,
    openOrderMaintenanceMargin: 0,
    marginRatio: balance / (maintenance * 2),
    payables: 0,
  });
  const at = Date.parse("2026-11-02T06:00:00Z"); // 15:00 JST

  it("is raised when Mm > B, with a 24h deadline and the shortfall as the amount", () => {
    expect(
      judgeMarginCall(account(480_000, 500_000), at, { marginCallGraceMs: 86_400_000 }),
    ).toEqual({
      judgedAt: "2026-11-02T06:00:00.000Z",
      deadline: "2026-11-03T06:00:00.000Z",
      amount: 20_000,
    });
    expect(judgeMarginCall(account(500_000, 500_000), at, { marginCallGraceMs: 86_400_000 })).toBe(
      null,
    );
  });

  it("expires exactly at the deadline", () => {
    const call = { judgedAt: "", deadline: "2026-11-03T06:00:00.000Z", amount: 1 };
    expect(isMarginCallExpired(call, Date.parse(call.deadline) - 1)).toBe(false);
    expect(isMarginCallExpired(call, Date.parse(call.deadline))).toBe(true);
  });

  it("is resolved once B ≥ Mm after an action", () => {
    expect(resolvesMarginCall(account(500_000, 500_000))).toBe(true);
    expect(resolvesMarginCall(account(499_999, 500_000))).toBe(false);
  });
});

describe("margin limit fills", () => {
  it("buy fills when the low reaches the price, sell when the high does", () => {
    expect(orderHits(order({ side: "buy", price: 9e6 }), { low: 9e6, high: 9.5e6 })).toBe(true);
    expect(orderHits(order({ side: "buy", price: 9e6 }), { low: 9.1e6, high: 9.5e6 })).toBe(false);
    expect(orderHits(order({ side: "sell", price: 11e6 }), { low: 10e6, high: 11e6 })).toBe(true);
  });

  it("an open fill creates a position with the open maker fee (a rebate here)", () => {
    const book: MarginBook = {
      jpy: 1_000_000,
      positions: [],
      orders: [order({ side: "buy", price: 9e6 })],
      call: null,
    };
    const r = ok(applyOrderFill(book, book.orders[0], FEE, T0));
    expect(r.book.orders).toEqual([]);
    expect(r.book.positions[0].product).toBe(450_000);
    expect(r.event).toMatchObject({ intent: "open", fee: -90 });
    expect(r.book.jpy).toBe(1_000_000); // 新規建ては JPY を動かさない
  });

  it("a close fill settles into JPY", () => {
    const book: MarginBook = {
      jpy: 1_000_000,
      positions: [position()],
      orders: [order()],
      call: null,
    };
    const r = ok(applyOrderFill(book, book.orders[0], FEE, T0));
    // (11,000,000 − 10,000,000) × 0.05 − (−110)
    expect(r.event.settlement?.profitLoss).toBeCloseTo(50_110, 6);
    expect(r.book.jpy).toBeCloseTo(1_050_110, 6);
    expect(r.book.positions[0].openAmount).toBeCloseTo(0.05, 12);
  });
});
