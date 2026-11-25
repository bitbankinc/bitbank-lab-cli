import { describe, expect, it } from "vitest";
import type { PositionSide } from "../../../margin-operation.js";
import {
  type AccountInput,
  evaluateAccount,
  type MarginAccount,
  type PendingMarginOrder,
} from "../../../paper-margin/account.js";
import { DEFAULT_LOSSCUT_MULTIPLIER } from "../../../paper-margin/assumptions.js";
import { isLosscutCondition, isMarginCallCondition } from "../../../paper-margin/conditions.js";
import { checkNewOpen, newOpenCapacity } from "../../../paper-margin/new-open.js";
import type { MarginPosition } from "../../../paper-margin/state.js";

const T0 = "2026-11-01T01:00:00.000Z";
const K = DEFAULT_LOSSCUT_MULTIPLIER;

function position(over: Partial<MarginPosition> = {}): MarginPosition {
  return {
    pair: "btc_jpy",
    positionSide: "long",
    openAmount: 0.1,
    product: 1_000_000, // 平均建値 10,000,000
    unrealizedFee: 1_000,
    unrealizedInterest: 400,
    openedAt: T0,
    lastInterestAt: T0,
    ...over,
  };
}

function input(over: Partial<AccountInput> & { at?: number } = {}): AccountInput {
  const { at = 9_000_000, ...rest } = over;
  return {
    jpy: 1_000_000,
    positions: [position()],
    openOrders: [],
    riskRatio: (pair) => ({ btc_jpy: 0.5, eth_jpy: 0.5, sol_jpy: 0.6 })[pair],
    price: () => at,
    ...rest,
  };
}

function ok<T>(r: { success: true; data: T } | { success: false; error: string }): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

describe("evaluateAccount: the published formulas", () => {
  it("B = D + U − C, Mm = P × r, ratio = B / P", () => {
    const a = ok(evaluateAccount(input()));
    expect(a).toEqual({
      collateral: 1_000_000,
      openPositionProduct: 1_000_000,
      positionProfitLoss: -100_000, // (9,000,000 − 10,000,000) × 0.1
      unrealizedCost: 1_400,
      totalMarginBalance: 898_600,
      positionMaintenanceMargin: 500_000,
      openOrderProduct: 0,
      openOrderMaintenanceMargin: 0,
      marginRatio: 0.8986,
      payables: 0,
    });
  });

  it("a short gains when the price falls", () => {
    const a = ok(evaluateAccount(input({ positions: [position({ positionSide: "short" })] })));
    expect(a.positionProfitLoss).toBeCloseTo(100_000, 6);
  });

  it("a hedge is valued with the price given per side and both sides need maintenance margin", () => {
    const price = (_pair: string, side: PositionSide) => (side === "long" ? 9_000_000 : 11_000_000);
    const a = ok(
      evaluateAccount(
        input({ positions: [position(), position({ positionSide: "short" })], price }),
      ),
    );
    expect(a.positionProfitLoss).toBeCloseTo(-200_000, 6);
    expect(a.positionMaintenanceMargin).toBe(1_000_000);
  });

  it("uses each pair's own risk ratio", () => {
    const sol = position({ pair: "sol_jpy", openAmount: 10, product: 200_000 });
    const a = ok(
      evaluateAccount(
        input({
          positions: [position(), sol],
          price: (p) => (p === "sol_jpy" ? 20_000 : 10_000_000),
        }),
      ),
    );
    expect(a.positionMaintenanceMargin).toBeCloseTo(500_000 + 120_000, 6);
  });

  it("counts only pending margin opens toward the order margin", () => {
    const orders: PendingMarginOrder[] = [
      { pair: "btc_jpy", side: "buy", positionSide: "long", amount: 0.05, price: 9_000_000 }, // 新規 → 数える
      { pair: "btc_jpy", side: "sell", positionSide: "long", amount: 0.05, price: 11_000_000 }, // 返済 → 数えない
      { pair: "btc_jpy", side: "buy", amount: 0.05, price: 9_000_000 }, // 現物 → 数えない
      { pair: "eth_jpy", side: "sell", positionSide: "short", amount: 1, price: 500_000 }, // 新規 → 数える
    ];
    const a = ok(evaluateAccount(input({ openOrders: orders })));
    expect(a.openOrderProduct).toBeCloseTo(450_000 + 500_000, 6);
    expect(a.openOrderMaintenanceMargin).toBeCloseTo(225_000 + 250_000, 6);
  });

  it("with no positions the ratio is null; a negative JPY balance is the shortfall", () => {
    const a = ok(evaluateAccount(input({ jpy: -5_000, positions: [] })));
    expect(a.marginRatio).toBe(null);
    expect(a.payables).toBe(5_000);
    expect(a.totalMarginBalance).toBe(-5_000);
    expect(isMarginCallCondition(a) || isLosscutCondition(a, K)).toBe(false);
  });

  it("fails instead of guessing when a price or risk ratio is missing", () => {
    const noPrice = evaluateAccount(input({ price: () => undefined }));
    expect(noPrice.success).toBe(false);
    if (!noPrice.success) expect(noPrice.error).toContain("price of btc_jpy (long)");
    const order: PendingMarginOrder = {
      pair: "xrp_jpy",
      side: "buy",
      positionSide: "long",
      amount: 1,
      price: 300,
    };
    const noRatio = evaluateAccount(input({ openOrders: [order] }));
    expect(noRatio.success).toBe(false);
    if (!noRatio.success) expect(noRatio.error).toContain("risk ratio of xrp_jpy");
  });
});

describe("margin call and losscut criteria", () => {
  it("worked example: 9M fine, 5M margin call, 2.5M losscut", () => {
    const at = (px: number) => ok(evaluateAccount(input({ at: px })));
    expect([isMarginCallCondition(at(9_000_000)), isLosscutCondition(at(9_000_000), K)]).toEqual([
      false,
      false,
    ]);
    expect([isMarginCallCondition(at(5_000_000)), isLosscutCondition(at(5_000_000), K)]).toEqual([
      true,
      false,
    ]); // B 498,600 < Mm 500,000
    expect([isMarginCallCondition(at(2_500_000)), isLosscutCondition(at(2_500_000), K)]).toEqual([
      true,
      true,
    ]); // B 248,600 < 250,000
  });

  it("the criteria are strict inequalities (equal is not triggered)", () => {
    const flat = (jpy: number) =>
      ok(
        evaluateAccount(
          input({
            jpy,
            at: 10_000_000,
            positions: [position({ unrealizedFee: 0, unrealizedInterest: 0 })],
          }),
        ),
      );
    expect(isMarginCallCondition(flat(500_000))).toBe(false);
    expect(isMarginCallCondition(flat(499_999.99))).toBe(true);
    expect(isLosscutCondition(flat(250_000), K)).toBe(false);
    expect(isLosscutCondition(flat(249_999.99), K)).toBe(true);
  });

  it("with r = 0.5: margin call ⇔ ratio < 50%, losscut ⇔ ratio < 25% (plan §2.3)", () => {
    for (let px = 1_000_000; px <= 12_000_000; px += 137_000) {
      const a = ok(evaluateAccount(input({ at: px })));
      const ratio = a.marginRatio as number;
      expect(isMarginCallCondition(a)).toBe(ratio < 0.5);
      expect(isLosscutCondition(a, K)).toBe(ratio < 0.25);
    }
  });
});

describe("new opens: B ≥ Mm + Mo + notional × r", () => {
  const empty = (): MarginAccount => ok(evaluateAccount(input({ positions: [] })));

  it("an empty account can open up to D / r in notional", () => {
    expect(newOpenCapacity(empty(), 0.5)).toBe(2_000_000);
    expect(
      checkNewOpen(empty(), { pair: "btc_jpy", notional: 2_000_000, riskRatio: 0.5 }).success,
    ).toBe(true);
  });

  it("rejects beyond capacity and explains it (50061 in production)", () => {
    const r = checkNewOpen(empty(), { pair: "btc_jpy", notional: 2_000_001, riskRatio: 0.5 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain("50061");
      expect(r.error).toContain("新規建て可能額は 2000000 円");
      expect(r.error).toContain("注文金額は 2000001 円");
    }
  });

  it("existing positions and pending opens use up the room", () => {
    const order: PendingMarginOrder = {
      pair: "btc_jpy",
      side: "buy",
      positionSide: "long",
      amount: 0.05,
      price: 9_000_000,
    };
    const a = ok(evaluateAccount(input({ openOrders: [order] }))); // B 898,600 − Mm 500,000 − Mo 225,000 = 173,600
    expect(newOpenCapacity(a, 0.5)).toBeCloseTo(347_200, 6);
    expect(checkNewOpen(a, { pair: "btc_jpy", notional: 347_200, riskRatio: 0.5 }).success).toBe(
      true,
    );
    expect(checkNewOpen(a, { pair: "btc_jpy", notional: 350_000, riskRatio: 0.5 }).success).toBe(
      false,
    );
  });

  it("capacity is 0 (not negative) when already short of margin", () => {
    const a = ok(evaluateAccount(input({ at: 5_000_000 })));
    expect(newOpenCapacity(a, 0.5)).toBe(0);
  });

  it.each([
    ["zero notional", { notional: 0, riskRatio: 0.5 }],
    ["ratio above 1", { notional: 1, riskRatio: 1.5 }],
  ])("rejects invalid input (%s)", (_label, req) => {
    expect(checkNewOpen(empty(), { pair: "btc_jpy", ...req }).success).toBe(false);
  });
});
