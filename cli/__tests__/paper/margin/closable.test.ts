import { describe, expect, it } from "vitest";
import {
  checkClosable,
  lockedAmountOf,
  type MarginOrderLike,
} from "../../../paper-margin/closable.js";
import type { MarginPosition } from "../../../paper-margin/state.js";

const T0 = "2026-11-01T00:00:00.000Z";

function position(over: Partial<MarginPosition>): MarginPosition {
  return {
    pair: "btc_jpy",
    positionSide: "long",
    openAmount: 0.04,
    product: 460_000,
    unrealizedFee: 0,
    unrealizedInterest: 0,
    openedAt: T0,
    lastInterestAt: T0,
    ...over,
  };
}

const ORDERS: MarginOrderLike[] = [
  { pair: "btc_jpy", side: "sell", positionSide: "long", amount: 0.01 }, // ロング返済 → 数える
  { pair: "btc_jpy", side: "buy", positionSide: "long", amount: 0.02 }, // ロング新規建て → 数えない
  { pair: "btc_jpy", side: "sell", amount: 0.5 }, // 現物 → 数えない
  { pair: "eth_jpy", side: "sell", positionSide: "long", amount: 0.3 }, // 別ペア
  { pair: "btc_jpy", side: "buy", positionSide: "short", amount: 0.04 }, // ショート返済
];

describe("lockedAmountOf", () => {
  it("sums only close orders of the same pair and side", () => {
    expect(lockedAmountOf(ORDERS, "btc_jpy", "long")).toBe(0.01);
    expect(lockedAmountOf(ORDERS, "btc_jpy", "short")).toBe(0.04);
    expect(lockedAmountOf(ORDERS, "xrp_jpy", "long")).toBe(0);
  });
});

describe("checkClosable", () => {
  const positions = [position({})];

  it("allows up to open amount minus locked amount", () => {
    const r = checkClosable(positions, ORDERS, {
      pair: "btc_jpy",
      positionSide: "long",
      amount: 0.03,
    });
    expect(r).toEqual({ success: true, data: { closable: 0.03 } });
  });

  it("tolerates float noise when the closable amount is passed back as-is", () => {
    const r = checkClosable(positions, ORDERS, {
      pair: "btc_jpy",
      positionSide: "long",
      amount: 0.03 + 1e-12,
    });
    expect(r.success).toBe(true);
  });

  it("rejects more than the closable amount and explains the numbers (50062 in production)", () => {
    const r = checkClosable(positions, ORDERS, {
      pair: "btc_jpy",
      positionSide: "long",
      amount: 0.031,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain("50062");
      expect(r.error).toContain("返済可能数量は 0.03");
      expect(r.error).toContain("建玉 0.04 − 未約定の返済注文 0.01");
      expect(r.exitCode).toBeUndefined();
    }
  });

  it("rejects closing a side that has no position", () => {
    const r = checkClosable(positions, [], {
      pair: "btc_jpy",
      positionSide: "short",
      amount: 0.01,
    });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.error).toBe("btc_jpy のショート建玉がありません（本番では 50062 で拒否される）");
  });
});
