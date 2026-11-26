import { describe, expect, it } from "vitest";
import { fillMarginMarket } from "../../../paper-margin/market-fill.js";
import type { MarginPairParams } from "../../../paper-margin/params.js";
import { emptyMarginState } from "../../../paper-margin/state.js";
import type { PaperState } from "../../../paper-state.js";

const OPEN = "2026-11-02T00:00:00.000Z"; // 09:00 JST
const BTC: MarginPairParams = {
  pair: "btc_jpy",
  riskRatio: 0.5,
  riskRatioUntilMs: 253402300799999,
  riskRatioSource: "current",
  fee: { openMaker: 0, openTaker: 0.001, closeMaker: 0, closeTaker: 0.002 },
  interestPerDay: { long: 0.0004, short: 0.0004 },
  stopNewLong: false,
  stopNewShort: false,
};

function state(): PaperState {
  return {
    version: 4,
    createdAt: OPEN,
    updatedAt: OPEN,
    initialJpy: 1_000_000,
    balances: { jpy: 1_000_000 },
    history: [],
    lastTickAt: OPEN,
    openOrders: [],
    margin: {
      ...emptyMarginState(OPEN),
      positions: [
        {
          pair: "btc_jpy",
          positionSide: "long",
          openAmount: 0.01,
          product: 100_000,
          unrealizedFee: 100,
          unrealizedInterest: 0,
          openedAt: OPEN,
          lastInterestAt: OPEN,
        },
      ],
    },
  };
}

describe("fillMarginMarket (pure)", () => {
  it("accrues the interest of an unaccrued JST midnight itself before closing", () => {
    const nowMs = Date.parse("2026-11-02T16:00:00Z"); // 01:00 JST 翌日（0 時を 1 回またぐ）
    const r = fillMarginMarket(state(), {
      id: "x",
      pair: "btc_jpy",
      side: "sell",
      positionSide: "long",
      amount: 0.01,
      op: { label: "ロング返済（sell × long）", intent: "close" },
      prices: new Map([["btc_jpy", 10_000_000]]),
      params: new Map([["btc_jpy", BTC]]),
      nowMs,
    });
    if (!r.success) throw new Error(r.error);
    expect(r.data.fill.interest).toBeCloseTo(40, 10);
    // 決済の手数料は close taker（0.002）: 0.01 × 10,000,000 × 0.002 = 200
    expect(r.data.fill).toMatchObject({ feeOccurred: 200, feeCharged: 300 });
    expect(r.data.fill.profitLoss).toBeCloseTo(-340, 10); // 値幅 0 − 手数料 300 − 利息 40
  });
});
