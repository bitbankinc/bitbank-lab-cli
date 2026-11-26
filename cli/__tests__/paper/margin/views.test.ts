// 100行超: margin-status / margin-positions の出力（本番と同名の欄・丸め・paper だけの欄）を数値の例で固定する
import { describe, expect, it } from "vitest";
import type { MarginPairParams } from "../../../paper-margin/params.js";
import { buildMarginPositions } from "../../../paper-margin/positions-view.js";
import { ceilTo, floorTo, roundTo, truncTo } from "../../../paper-margin/rounding.js";
import { emptyMarginState, type MarginOrder } from "../../../paper-margin/state.js";
import { buildMarginStatus } from "../../../paper-margin/status.js";
import type { PaperState } from "../../../paper-state.js";

const T = "2026-11-02T00:00:00.000Z";
const NOW = Date.parse(T);
const params = (pair: string): MarginPairParams => ({
  pair,
  riskRatio: 0.5,
  riskRatioUntilMs: 253402300799999,
  riskRatioSource: "current",
  fee: { openMaker: 0, openTaker: 0.001, closeMaker: 0, closeTaker: 0.001 },
  interestPerDay: { long: 0.0004, short: 0.0004 },
  stopNewLong: false,
  stopNewShort: false,
});
const PARAMS = new Map([
  ["btc_jpy", params("btc_jpy")],
  ["xrp_jpy", params("xrp_jpy")],
]);
const PRICES = new Map([["btc_jpy", 9_000_000]]);

const OPEN: MarginOrder = {
  id: "o",
  pair: "btc_jpy",
  side: "buy",
  positionSide: "long",
  type: "limit",
  price: 9_000_000,
  amount: 0.05,
  createdAt: T,
};
const CLOSE: MarginOrder = {
  id: "c",
  pair: "btc_jpy",
  side: "sell",
  positionSide: "long",
  type: "limit",
  price: 12_000_000,
  amount: 0.03,
  createdAt: T,
};

function state(over: Partial<PaperState["margin"]> = {}, jpy = 1_000_000): PaperState {
  return {
    version: 4,
    createdAt: T,
    updatedAt: T,
    initialJpy: 1_000_000,
    balances: { jpy },
    history: [],
    lastTickAt: T,
    openOrders: [],
    margin: {
      ...emptyMarginState(T),
      positions: [
        {
          pair: "btc_jpy",
          positionSide: "long",
          openAmount: 0.1,
          product: 1_000_000,
          unrealizedFee: 1_000.4,
          unrealizedInterest: 400,
          openedAt: T,
          lastInterestAt: T,
        },
      ],
      orders: [OPEN, CLOSE],
      ...over,
    },
  };
}

function ok<T>(r: { success: true; data: T } | { success: false; error: string }): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

describe("rounding like the production docs", () => {
  it("truncates, floors and ceils at the given digits without float noise", () => {
    expect(truncTo(89.85996, 2)).toBe(89.85);
    expect(truncTo(49.999999999999, 2)).toBe(50); // 誤差で 49.99 にしない
    expect(truncTo(-1.00009, 4)).toBe(-1);
    expect(floorTo(-1.00001, 4)).toBe(-1.0001);
    expect(ceilTo(1400.40001, 4)).toBe(1400.4001);
  });

  it("does not let float noise leak as a unit (0 stays 0, not −0.0001)", () => {
    expect(floorTo(-9.3e-11, 4)).toBe(0);
    expect(ceilTo(9.3e-11, 4)).toBe(0);
    expect(Object.is(truncTo(-1e-12, 2), 0)).toBe(true); // −0 は 0 に
    expect(roundTo(9615931.999999998, 4)).toBe(9615932);
  });

  it("absorbs only binary noise, not meaningful lower digits (no double rounding)", () => {
    expect(roundTo(1.23444999, 4)).toBe(1.2344);
    expect(floorTo(1.23449999, 4)).toBe(1.2344);
    expect(roundTo(1.005, 2)).toBe(1.01); // 1.005 × 100 = 100.49999999999999
    expect(truncTo(49.999999999999, 2)).toBe(50);
  });
});

describe("buildMarginStatus", () => {
  it("fills the production-named fields with the published formulas and rounding", () => {
    const v = ok(buildMarginStatus(state(), PARAMS, PRICES, NOW));
    expect(v).toMatchObject({
      status: "NORMAL",
      total_margin_balance: 898_599.6, // 1,000,000 − 100,000 − 1,400.4
      total_margin_balance_percentage: 89.85, // 切り捨て 2 桁（89.85996…）
      margin_position_profit_loss: -100_000,
      unrealized_cost: 1_400.4,
      total_margin_position_product: 1_450_000,
      open_margin_position_product: 1_000_000,
      open_margin_order_product: 450_000, // 返済の指値は入らない
      total_position_maintenance_margin: 500_000,
      total_long_position_maintenance_margin: 500_000,
      total_short_position_maintenance_margin: 0,
      total_open_order_maintenance_margin: 225_000,
      total_long_open_order_maintenance_margin: 225_000,
      total_short_open_order_maintenance_margin: 0,
      thresholds: { margin_call_below_percentage: 50, losscut_below_percentage: 25 },
      payables: { amount: 0 },
      stale: false,
    });
  });

  it("lists every margin pair in available_balances with the paper capacity (B − Mm − Mo) / r", () => {
    const v = ok(buildMarginStatus(state(), PARAMS, PRICES, NOW));
    expect(v.available_balances).toEqual([
      { pair: "btc_jpy", long: 347_199.2, short: 347_199.2 },
      { pair: "xrp_jpy", long: 347_199.2, short: 347_199.2 },
    ]);
  });

  it("shows 0 capacity where create-margin-order would refuse an open (margin call, stopped side)", () => {
    const call = { judgedAt: T, deadline: "2026-11-03T00:00:00.000Z", amount: 1 };
    const during = ok(buildMarginStatus(state({ call }), PARAMS, PRICES, NOW));
    expect(during.available_balances.every((x) => x.long === 0 && x.short === 0)).toBe(true);
    const stopped = new Map(PARAMS).set("btc_jpy", { ...params("btc_jpy"), stopNewLong: true });
    const v = ok(buildMarginStatus(state(), stopped, PRICES, NOW));
    expect(v.available_balances[0]).toEqual({ pair: "btc_jpy", long: 0, short: 347_199.2 });
  });

  it("carries the assumptions with the risk ratios and valuation prices it used", () => {
    const v = ok(buildMarginStatus(state(), PARAMS, PRICES, NOW));
    expect(v.assumptions.riskRatios.btc_jpy).toEqual({
      ratio: 0.5,
      until: "9999-12-31T23:59:59.999Z",
      source: "current",
    });
    expect(v.assumptions.valuationPrices).toEqual({ btc_jpy: 9_000_000 });
    expect(v.assumptions.rules.losscutMultiplier).toBe(0.5);
  });

  it("reports CALL / DEBT, null ratios without positions, and stale when the tick fell behind", () => {
    const call = { judgedAt: T, deadline: "2026-11-03T00:00:00.000Z", amount: 1 };
    expect(ok(buildMarginStatus(state({ call }), PARAMS, PRICES, NOW)).status).toBe("CALL");
    const debt = ok(
      buildMarginStatus(state({ positions: [], orders: [] }, -5_000), PARAMS, PRICES, NOW),
    );
    expect(debt).toMatchObject({
      status: "DEBT",
      payables: { amount: 5_000 },
      total_margin_balance_percentage: null,
    });
    expect(debt.thresholds).toEqual({
      margin_call_below_percentage: null,
      losscut_below_percentage: null,
    });
    expect(debt.available_balances[0].long).toBe(0);
    expect(ok(buildMarginStatus(state(), PARAMS, PRICES, NOW + 1)).stale).toBe(true);
  });

  it("fails rather than guessing when a position's price is missing", () => {
    expect(buildMarginStatus(state(), PARAMS, new Map(), NOW).success).toBe(false);
  });
});

describe("buildMarginPositions", () => {
  it("shows locked amount, average price and paper's per-position unrealized PnL", () => {
    const v = buildMarginPositions(state(), PRICES, NOW);
    expect(v.notice).toBe(null);
    expect(v.positions).toEqual([
      {
        pair: "btc_jpy",
        position_side: "long",
        open_amount: 0.1,
        locked_amount: 0.03, // 返済の指値の分
        product: 1_000_000,
        average_price: 10_000_000,
        unrealized_fee_amount: 1_000.4,
        unrealized_interest_amount: 400,
        opened_at: T,
        current_price: 9_000_000,
        unrealized_profit_loss: -100_000,
      },
    ]);
  });

  it("rounds the yen fields so float noise from product / amount does not show (live run: 9615931.999999998)", () => {
    const p = {
      pair: "btc_jpy",
      positionSide: "long" as const,
      openAmount: 0.05,
      product: 480_796.6,
      unrealizedFee: 480.7966,
      unrealizedInterest: 0,
      openedAt: T,
      lastInterestAt: T,
    };
    const v = buildMarginPositions(
      state({ positions: [p], orders: [] }),
      new Map([["btc_jpy", 9_615_932]]),
      NOW,
    );
    expect(v.positions[0].average_price).toBe(9_615_932);
    expect(v.positions[0].unrealized_profit_loss).toBe(0);
  });

  it("gives a margin_call notice with Unix ms times, a debt notice for a shortfall, and filters by pair", () => {
    const call = { judgedAt: T, deadline: "2026-11-03T00:00:00.000Z", amount: 20_000 };
    expect(buildMarginPositions(state({ call }), PRICES, NOW).notice).toEqual({
      what: "margin_call",
      occurred_at: NOW,
      amount: 20_000,
      due_date_at: Date.parse("2026-11-03T00:00:00.000Z"),
    });
    expect(buildMarginPositions(state({}, -1), PRICES, NOW).notice).toMatchObject({
      what: "debt",
      amount: 1,
    });
    expect(buildMarginPositions(state(), PRICES, NOW, "eth_jpy").positions).toEqual([]);
  });
});
