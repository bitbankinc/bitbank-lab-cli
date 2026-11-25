import { describe, expect, it } from "vitest";
import { applyClose } from "../../../paper-margin/close.js";
import {
  applyOpen,
  averagePrice,
  findPosition,
  type MarginFill,
  unrealizedPnl,
} from "../../../paper-margin/positions.js";
import type { MarginPosition } from "../../../paper-margin/state.js";

const T0 = "2026-11-01T00:00:00.000Z"; // 09:00 JST
const T1 = "2026-11-01T05:00:00.000Z"; // 14:00 JST（同じ JST の日。利息の境界をまたがない）
const NEXT_DAY = "2026-11-02T01:00:00.000Z"; // 10:00 JST 翌日（JST 0 時を 1 回またぐ）

function fill(over: Partial<MarginFill>): MarginFill {
  return {
    pair: "btc_jpy",
    positionSide: "long",
    amount: 0.01,
    price: 10_000_000,
    fee: 100,
    at: T0,
    ...over,
  };
}

function ok<T>(r: { success: true; data: T } | { success: false; error: string }): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

/** 0.01 @ 10,000,000（手数料 100）+ 0.03 @ 12,000,000（手数料 360）のロング */
function twoOpens(): MarginPosition[] {
  const a = ok(applyOpen([], fill({})));
  return ok(applyOpen(a, fill({ amount: 0.03, price: 12_000_000, fee: 360, at: T1 })));
}

describe("applyOpen", () => {
  it("creates a position with the fill as its average price and fee as unrealized fee", () => {
    const [p] = ok(applyOpen([], fill({})));
    expect(p).toEqual({
      pair: "btc_jpy",
      positionSide: "long",
      openAmount: 0.01,
      product: 100_000,
      unrealizedFee: 100,
      unrealizedInterest: 0,
      openedAt: T0,
      lastInterestAt: T0,
    });
    expect(averagePrice(p)).toBe(10_000_000);
  });

  it("adds to an existing position with a weighted average and keeps its timestamps", () => {
    const [p] = twoOpens();
    expect(p.openAmount).toBeCloseTo(0.04, 12);
    expect(p.product).toBe(460_000);
    expect(averagePrice(p)).toBeCloseTo(11_500_000, 4);
    expect(p.unrealizedFee).toBe(460);
    expect(p.openedAt).toBe(T0);
    expect(p.lastInterestAt).toBe(T0);
  });

  it("keeps long and short of the same pair as separate positions (hedged)", () => {
    const a = ok(applyOpen([], fill({})));
    const b = ok(applyOpen(a, fill({ positionSide: "short", price: 10_100_000 })));
    expect(b).toHaveLength(2);
    expect(findPosition(b, "btc_jpy", "long")?.product).toBe(100_000);
    expect(findPosition(b, "btc_jpy", "short")?.product).toBe(101_000);
  });

  it("records a maker rebate as a negative unrealized fee", () => {
    const [p] = ok(applyOpen([], fill({ fee: -20 })));
    expect(p.unrealizedFee).toBe(-20);
  });

  it.each([
    ["zero amount", { amount: 0 }],
    ["negative price", { price: -1 }],
    ["NaN fee", { fee: Number.NaN }],
  ])("rejects an unusable fill (%s)", (_label, over) => {
    expect(applyOpen([], fill(over)).success).toBe(false);
  });

  it("does not mutate the input", () => {
    const before = Object.freeze(ok(applyOpen([], fill({}))).map((p) => Object.freeze(p)));
    ok(applyOpen(before, fill({ amount: 0.02 })));
    expect(before[0].openAmount).toBe(0.01);
  });
});

describe("unrealizedPnl", () => {
  it("long gains when the price rises, short gains when it falls", () => {
    const [long] = ok(applyOpen([], fill({})));
    const [short] = ok(applyOpen([], fill({ positionSide: "short" })));
    expect(unrealizedPnl(long, 11_000_000)).toBeCloseTo(10_000, 6);
    expect(unrealizedPnl(short, 11_000_000)).toBeCloseTo(-10_000, 6);
  });
});

describe("applyClose", () => {
  it("partial close settles prorated fee and interest and keeps the average price", () => {
    const [p] = twoOpens();
    const withInterest = [{ ...p, unrealizedInterest: 40 }];
    const r = ok(
      applyClose(
        withInterest,
        fill({ positionSide: "long", amount: 0.01, price: 13_000_000, fee: 130 }),
      ),
    );
    expect(r.settlement.averagePrice).toBeCloseTo(11_500_000, 4);
    expect(r.settlement.gross).toBeCloseTo(15_000, 4);
    expect(r.settlement.feeCharged).toBeCloseTo(115 + 130, 6);
    expect(r.settlement.interestCharged).toBeCloseTo(10, 6);
    expect(r.settlement.profitLoss).toBeCloseTo(15_000 - 245 - 10, 4);
    const [rest] = r.positions;
    expect(rest.openAmount).toBeCloseTo(0.03, 12);
    expect(rest.product).toBeCloseTo(345_000, 4);
    expect(averagePrice(rest)).toBeCloseTo(11_500_000, 4);
    expect(rest.unrealizedFee).toBeCloseTo(345, 6);
    expect(rest.unrealizedInterest).toBeCloseTo(30, 6);
  });

  it("full close removes the position and charges all unrealized fee and interest", () => {
    const [p] = twoOpens();
    const r = ok(
      applyClose(
        [{ ...p, unrealizedInterest: 40 }],
        fill({ amount: 0.04, price: 11_000_000, fee: 44 }),
      ),
    );
    expect(r.positions).toEqual([]);
    expect(r.settlement.gross).toBeCloseTo(-20_000, 4);
    expect(r.settlement.feeCharged).toBeCloseTo(460 + 44, 6);
    expect(r.settlement.interestCharged).toBeCloseTo(40, 6);
    expect(r.settlement.profitLoss).toBeCloseTo(-20_000 - 504 - 40, 4);
  });

  it("short profits when closed below the average price; a close rebate lowers the fee", () => {
    const opened = ok(
      applyOpen(
        [],
        fill({ pair: "eth_jpy", positionSide: "short", amount: 0.1, price: 500_000, fee: 60 }),
      ),
    );
    const r = ok(
      applyClose(
        opened,
        fill({ pair: "eth_jpy", positionSide: "short", amount: 0.1, price: 450_000, fee: -9 }),
      ),
    );
    expect(r.settlement.gross).toBeCloseTo(5_000, 6);
    expect(r.settlement.feeCharged).toBeCloseTo(51, 6);
    expect(r.settlement.profitLoss).toBeCloseTo(4_949, 6);
  });

  it("treats a close within EPS above the open amount as a full close", () => {
    const opened = ok(
      applyOpen(ok(applyOpen([], fill({ amount: 0.0011 }))), fill({ amount: 0.0021 })),
    );
    const r = ok(applyClose(opened, fill({ amount: 0.0032 + 1e-12 })));
    expect(r.positions).toEqual([]);
  });

  it("rejects closing more than the open amount, or a side that is not held", () => {
    const opened = ok(applyOpen([], fill({})));
    expect(applyClose(opened, fill({ amount: 0.011 })).success).toBe(false);
    const wrongSide = applyClose(opened, fill({ positionSide: "short" }));
    expect(wrongSide.success).toBe(false);
    if (!wrongSide.success) expect(wrongSide.error).toContain("no short position");
  });

  it("leaves the other side of a hedge untouched", () => {
    const a = ok(applyOpen([], fill({})));
    const b = ok(applyOpen(a, fill({ positionSide: "short" })));
    const r = ok(applyClose(b, fill({ positionSide: "long" })));
    expect(r.positions).toEqual([findPosition(b, "btc_jpy", "short")]);
  });

  it("after closing everything in pieces, the charges add up to what was accrued", () => {
    let pos = twoOpens();
    pos = [{ ...pos[0], unrealizedInterest: 40 }];
    const closeFees = [11, 22, 33];
    let feeCharged = 0;
    let interestCharged = 0;
    for (const [i, amount] of [0.005, 0.015, 0.02].entries()) {
      const r = ok(applyClose(pos, fill({ amount, price: 12_000_000, fee: closeFees[i] })));
      pos = r.positions;
      feeCharged += r.settlement.feeCharged;
      interestCharged += r.settlement.interestCharged;
    }
    expect(pos).toEqual([]);
    expect(feeCharged).toBeCloseTo(460 + 11 + 22 + 33, 6);
    expect(interestCharged).toBeCloseTo(40, 6);
  });
});

describe("interest must be accrued before changing a position", () => {
  it("rejects adding to a position across a JST midnight that has not been accrued", () => {
    const opened = ok(applyOpen([], fill({})));
    const r = applyOpen(opened, fill({ amount: 0.02, at: NEXT_DAY }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("interest not accrued");
  });

  it("rejects closing across an unaccrued JST midnight (the interest would be lost)", () => {
    const opened = ok(applyOpen([], fill({})));
    const r = applyClose(opened, fill({ at: NEXT_DAY }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("interest not accrued");
  });

  it("allows both once lastInterestAt has been moved past the midnight", () => {
    const [p] = ok(applyOpen([], fill({})));
    const accrued = [{ ...p, lastInterestAt: NEXT_DAY, unrealizedInterest: 40 }];
    expect(applyOpen(accrued, fill({ amount: 0.02, at: NEXT_DAY })).success).toBe(true);
    expect(applyClose(accrued, fill({ at: NEXT_DAY })).success).toBe(true);
  });

  it("creating a new position never needs accrual (it starts at its own fill time)", () => {
    expect(applyOpen([], fill({ at: NEXT_DAY })).success).toBe(true);
  });
});
