import { describe, expect, it } from "vitest";
import { atr, ema, macdHist, rsi, sma } from "../../brief/indicators.js";

describe("sma / ema", () => {
  it("sma averages the last n values and returns null when short", () => {
    expect(sma([1, 2, 3, 4], 2)).toBe(3.5);
    expect(sma([1, 2, 3], 4)).toBeNull();
    expect(sma([1, 2, 3], 0)).toBeNull();
  });

  it("ema seeds with the SMA of the first n values (indicator-guide)", () => {
    // n=3: seed = (1+2+3)/3 = 2, k = 0.5 → 4*0.5 + 2*0.5 = 3 → 5*0.5 + 3*0.5 = 4
    expect(ema([1, 2, 3, 4, 5], 3)).toEqual([2, 3, 4]);
    expect(ema([1, 2], 3)).toEqual([]);
  });
});

describe("rsi (Wilder)", () => {
  it("is 100 when there are no losses and 0 when there are no gains", () => {
    const up = Array.from({ length: 20 }, (_, i) => 100 + i);
    const down = Array.from({ length: 20 }, (_, i) => 100 - i);
    expect(rsi(up, 14)).toBe(100);
    expect(rsi(down, 14)).toBe(0);
    // 横ばい（gain も loss も 0）は中立の 50
    expect(rsi(Array(20).fill(100), 14)).toBe(50);
  });

  it("matches a hand-computed Wilder value on a short series", () => {
    // n=2, closes 10,11,10,12 → gains [1,0,2] losses [0,1,0]
    // seed: ag=(1+0)/2=0.5 al=(0+1)/2=0.5 → next: ag=(0.5*1+2)/2=1.25 al=(0.5*1+0)/2=0.25
    // RS=5 → RSI = 100 - 100/6 = 83.333…
    expect(rsi([10, 11, 10, 12], 2)).toBeCloseTo(83.3333, 3);
    expect(rsi([10, 11], 2)).toBeNull();
  });
});

describe("macdHist", () => {
  it("needs at least 26 + 9 - 1 closes and is positive on a rising series", () => {
    expect(macdHist(Array.from({ length: 33 }, (_, i) => i))).toBeNull();
    const rising = Array.from({ length: 60 }, (_, i) => 100 * 1.01 ** i);
    const h = macdHist(rising);
    expect(h).not.toBeNull();
    expect(h as number).toBeGreaterThan(0);
    // 横ばいから急落に転じた直後はヒストグラムが負
    const flatThenDrop = [
      ...Array(40).fill(100),
      ...Array.from({ length: 20 }, (_, i) => 100 - 2 * i),
    ];
    expect(macdHist(flatThenDrop) as number).toBeLessThan(0);
  });
});

describe("atr (Wilder)", () => {
  it("equals the constant true range on a flat-range series", () => {
    const rows = Array.from({ length: 20 }, () => ({ open: 100, high: 110, low: 90, close: 100 }));
    expect(atr(rows, 14)).toBe(20);
    expect(atr(rows.slice(0, 14), 14)).toBeNull();
  });

  it("uses gaps against the previous close", () => {
    // 2 rows: TR of row1 = max(h-l=2, |h-pc|=12, |l-pc|=10) = 12
    const rows = [
      { open: 100, high: 100, low: 100, close: 100 },
      { open: 111, high: 112, low: 110, close: 111 },
    ];
    expect(atr(rows, 1)).toBe(12);
  });
});
