import { describe, expect, it } from "vitest";
import { applyClose } from "../../../paper-margin/close.js";
import { accrueInterest, pendingInterestBoundaries } from "../../../paper-margin/interest.js";
import { applyOpen } from "../../../paper-margin/positions.js";
import type { MarginPosition } from "../../../paper-margin/state.js";

const P = Date.parse;
const OPEN = "2026-11-01T01:00:00.000Z"; // 2026-11-01 10:00 JST
const MIDNIGHT_1 = P("2026-11-01T15:00:00Z"); // 2026-11-02 00:00 JST
const DAY_2_10JST = P("2026-11-02T01:00:00Z");
const DAY_4_10JST = P("2026-11-04T01:00:00Z");

const RATES = new Map([
  ["btc_jpy", { interestPerDay: { long: 0.0004, short: 0.0005 } }],
  ["eth_jpy", { interestPerDay: { long: 0.0004, short: 0.0004 } }],
]);

function position(over: Partial<MarginPosition> = {}): MarginPosition {
  return {
    pair: "btc_jpy",
    positionSide: "long",
    openAmount: 0.01,
    product: 100_000,
    unrealizedFee: 100,
    unrealizedInterest: 0,
    openedAt: OPEN,
    lastInterestAt: OPEN,
    ...over,
  };
}

function ok<T>(r: { success: true; data: T } | { success: false; error: string }): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

describe("accrueInterest: product × daily rate per JST midnight crossed", () => {
  it("charges nothing before the first JST midnight, but still advances lastInterestAt", () => {
    const r = ok(accrueInterest([position()], RATES, MIDNIGHT_1 - 1));
    expect(r.charges).toEqual([]);
    expect(r.positions[0].unrealizedInterest).toBe(0);
    expect(r.positions[0].lastInterestAt).toBe(new Date(MIDNIGHT_1 - 1).toISOString());
  });

  it("charges one day at JST midnight (100,000 × 0.0004 = 40)", () => {
    const r = ok(accrueInterest([position()], RATES, MIDNIGHT_1));
    expect(r.positions[0].unrealizedInterest).toBeCloseTo(40, 10);
    expect(r.charges).toEqual([
      { pair: "btc_jpy", positionSide: "long", atMs: MIDNIGHT_1, amount: 40 },
    ]);
  });

  it("does not charge a second day just because 24h passed", () => {
    const r = ok(accrueInterest([position()], RATES, DAY_2_10JST));
    expect(r.positions[0].unrealizedInterest).toBeCloseTo(40, 10);
  });

  it("charges each midnight over several days, and step-wise accrual equals one shot", () => {
    const once = ok(accrueInterest([position()], RATES, DAY_4_10JST));
    expect(once.positions[0].unrealizedInterest).toBeCloseTo(120, 10);
    expect(once.charges.map((c) => c.atMs)).toEqual([
      MIDNIGHT_1,
      MIDNIGHT_1 + 86_400_000,
      MIDNIGHT_1 + 2 * 86_400_000,
    ]);
    let pos = [position()];
    for (const t of [
      MIDNIGHT_1 - 1,
      MIDNIGHT_1,
      DAY_2_10JST,
      DAY_2_10JST + 3600_000,
      DAY_4_10JST,
    ]) {
      pos = ok(accrueInterest(pos, RATES, t)).positions;
    }
    expect(pos[0].unrealizedInterest).toBeCloseTo(120, 10);
  });

  it("uses the short rate (crypto lending fee) for a short position", () => {
    const r = ok(accrueInterest([position({ positionSide: "short" })], RATES, MIDNIGHT_1));
    expect(r.positions[0].unrealizedInterest).toBeCloseTo(50, 10);
  });

  it("an amount added after a midnight starts paying from the next midnight", () => {
    let pos = ok(accrueInterest([position()], RATES, DAY_2_10JST)).positions; // 40
    pos = ok(
      applyOpen(pos, {
        pair: "btc_jpy",
        positionSide: "long",
        amount: 0.01,
        price: 12_000_000,
        fee: 120,
        at: new Date(DAY_2_10JST).toISOString(),
      }),
    ); // product 100,000 + 120,000
    pos = ok(accrueInterest(pos, RATES, DAY_2_10JST + 86_400_000)).positions; // + 220,000 × 0.0004
    expect(pos[0].unrealizedInterest).toBeCloseTo(40 + 88, 10);
  });

  it("fails only when a position that crosses midnight has no rate", () => {
    const xrp = position({ pair: "xrp_jpy" });
    const crossing = accrueInterest([position(), xrp], RATES, MIDNIGHT_1);
    expect(crossing.success).toBe(false);
    if (!crossing.success) expect(crossing.error).toContain("xrp_jpy");
    expect(accrueInterest([xrp], RATES, MIDNIGHT_1 - 1).success).toBe(true);
  });

  it("leaves a position untouched when toMs is not after lastInterestAt", () => {
    const p = position();
    const r = ok(accrueInterest([p], RATES, P(OPEN)));
    expect(r.positions[0]).toBe(p);
    expect(accrueInterest([p], RATES, Number.NaN).success).toBe(false);
  });

  it("pendingInterestBoundaries reports the midnights not yet accrued", () => {
    expect(pendingInterestBoundaries(position(), DAY_4_10JST)).toHaveLength(3);
    expect(pendingInterestBoundaries(position(), MIDNIGHT_1 - 1)).toEqual([]);
  });
});

describe("interest through to the close (profit_loss = 値幅損益 − 手数料 − interest)", () => {
  it("a full close two midnights later settles the accrued interest out of the profit", () => {
    const at = new Date(DAY_2_10JST + 86_400_000).toISOString(); // 2 回またぐ
    const accrued = ok(accrueInterest([position()], RATES, Date.parse(at))).positions;
    expect(accrued[0].unrealizedInterest).toBeCloseTo(80, 10);
    const r = ok(
      applyClose(accrued, {
        pair: "btc_jpy",
        positionSide: "long",
        amount: 0.01,
        price: 10_500_000,
        fee: 105,
        at,
      }),
    );
    expect(r.settlement.gross).toBeCloseTo(5_000, 6);
    expect(r.settlement.feeCharged).toBeCloseTo(100 + 105, 6);
    expect(r.settlement.interestCharged).toBeCloseTo(80, 6);
    expect(r.settlement.profitLoss).toBeCloseTo(5_000 - 205 - 80, 6);
  });
});
