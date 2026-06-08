import { describe, expect, it } from "vitest";
import { applyFillToBalances } from "../../paper-state.js";

describe("applyFillToBalances", () => {
  it("buy: deducts cost from quote and adds amount to base", () => {
    const next = applyFillToBalances({ jpy: 1_000_000 }, "buy", "btc", "jpy", 0.001, {
      cost: 5005,
      proceeds: 4995,
    });
    expect(next.jpy).toBe(1_000_000 - 5005);
    expect(next.btc).toBe(0.001);
  });

  it("sell: deducts amount from base and adds proceeds to quote", () => {
    const next = applyFillToBalances({ jpy: 1_000_000, btc: 0.01 }, "sell", "btc", "jpy", 0.005, {
      cost: 30_060,
      proceeds: 29_940,
    });
    expect(next.btc).toBeCloseTo(0.005, 10);
    expect(next.jpy).toBe(1_000_000 + 29_940);
  });

  it("buy: absent quote/base fall back to 0 (?? 0)", () => {
    const next = applyFillToBalances({}, "buy", "btc", "jpy", 0.001, {
      cost: 5000,
      proceeds: 4990,
    });
    // quote 不在 → 0 - cost、base 不在 → 0 + amount
    expect(next.jpy).toBe(-5000);
    expect(next.btc).toBe(0.001);
  });

  it("sell: absent base/quote fall back to 0 (?? 0)", () => {
    const next = applyFillToBalances({}, "sell", "btc", "jpy", 0.005, { cost: 0, proceeds: 5000 });
    expect(next.btc).toBe(-0.005);
    expect(next.jpy).toBe(5000);
  });

  it("returns a new object and does not mutate the input", () => {
    const balances = { jpy: 1_000_000 };
    const next = applyFillToBalances(balances, "buy", "btc", "jpy", 0.001, {
      cost: 5000,
      proceeds: 4990,
    });
    expect(next).not.toBe(balances);
    expect(balances).toEqual({ jpy: 1_000_000 });
  });

  it("leaves unrelated assets untouched", () => {
    const next = applyFillToBalances(
      { jpy: 1_000_000, eth: 2, btc: 0.5 },
      "buy",
      "btc",
      "jpy",
      0.001,
      {
        cost: 5000,
        proceeds: 4990,
      },
    );
    expect(next.eth).toBe(2);
    expect(next.btc).toBe(0.501);
    expect(next.jpy).toBe(995_000);
  });
});
