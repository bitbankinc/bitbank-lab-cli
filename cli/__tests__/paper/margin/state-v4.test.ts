import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bookOf, withBook } from "../../../paper-margin/book.js";
import {
  historyOfFill,
  historyOfLosscut,
  MarginHistoryEntrySchema,
} from "../../../paper-margin/history.js";
import { emptyMarginState, type MarginOrder } from "../../../paper-margin/state.js";
import { computeLocked, loadState, type PaperState, saveState } from "../../../paper-state.js";

const T = "2026-11-02T00:00:00.000Z";
let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "paper-v4-"));
  path = join(dir, "paper-state.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const V3 = {
  version: 3,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-03-04T05:06:07.000Z",
  initialJpy: 1_000_000,
  balances: { jpy: 900_000, btc: 0.01 },
  history: [
    {
      id: "h1",
      pair: "btc_jpy",
      side: "buy",
      type: "market",
      amount: 0.01,
      fillPrice: 1e7,
      feeQuote: 120,
      filledAt: T,
    },
  ],
  lastTickAt: "2026-03-04T05:06:07.000Z",
  openOrders: [],
};

const ORDER: MarginOrder = {
  id: "m1",
  pair: "btc_jpy",
  side: "buy",
  positionSide: "long",
  type: "limit",
  price: 9_000_000,
  amount: 0.1,
  createdAt: T,
};

function v4(margin: Partial<PaperState["margin"]> = {}): PaperState {
  return {
    ...(V3 as unknown as Omit<PaperState, "version" | "margin">),
    version: 4,
    margin: { ...emptyMarginState(T), ...margin },
  };
}

describe("PaperState v4", () => {
  it("migrates v3 by adding an empty margin block and leaves the spot fields untouched", async () => {
    writeFileSync(path, JSON.stringify(V3));
    const r = await loadState(path);
    if (!r.success || !r.data) throw new Error("load failed");
    expect(r.data.version).toBe(4);
    expect(r.data.balances).toEqual(V3.balances);
    expect(r.data.history).toEqual(V3.history);
    expect(r.data.margin).toMatchObject({ positions: [], orders: [], call: null, history: [] });
  });

  it("the migrated assumptions are deterministic (fixedAt = the state's updatedAt), even across reads", async () => {
    writeFileSync(path, JSON.stringify(V3));
    const a = await loadState(path);
    const b = await loadState(path);
    if (!a.success || !a.data || !b.success || !b.data) throw new Error("load failed");
    expect(a.data.margin.assumptions.fixedAt).toBe(V3.updatedAt);
    expect(a.data.margin).toEqual(b.data.margin);
  });

  it("round-trips a populated margin block", async () => {
    const state = v4({
      positions: [
        {
          pair: "btc_jpy",
          positionSide: "short",
          openAmount: 0.1,
          product: 1_000_000,
          unrealizedFee: -20,
          unrealizedInterest: 400,
          openedAt: T,
          lastInterestAt: T,
        },
      ],
      orders: [ORDER],
      call: { judgedAt: T, deadline: "2026-11-03T00:00:00.000Z", amount: 20_000 },
    });
    await saveState(state, path);
    const r = await loadState(path);
    if (!r.success || !r.data) throw new Error("load failed");
    expect(r.data).toEqual(state);
  });

  it.each([
    [
      "a negative position amount",
      {
        positions: [
          {
            pair: "btc_jpy",
            positionSide: "long",
            openAmount: -1,
            product: 1,
            unrealizedFee: 0,
            unrealizedInterest: 0,
            openedAt: T,
            lastInterestAt: T,
          },
        ],
      },
    ],
    ["an unknown position side", { orders: [{ ...ORDER, positionSide: "both" }] }],
    [
      "a losscut multiplier above 1",
      {
        assumptions: {
          ...emptyMarginState(T).assumptions,
          rules: { losscutMultiplier: 2, marginCallHourJst: 15, marginCallGraceMs: 1 },
        },
      },
    ],
  ])("rejects a v4 file with %s", async (_label, margin) => {
    writeFileSync(path, JSON.stringify({ ...v4(), margin: { ...emptyMarginState(T), ...margin } }));
    const r = await loadState(path);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("Invalid paper state");
  });

  it("spot locks ignore margin orders (they live in margin.orders, not openOrders)", () => {
    expect(computeLocked(v4({ orders: [ORDER] }))).toEqual({});
  });
});

describe("book.ts", () => {
  it("bookOf / withBook move the JPY balance and the margin parts, and keep the rest", () => {
    const state = v4({ orders: [ORDER] });
    const book = bookOf(state);
    expect(book).toEqual({ jpy: 900_000, positions: [], orders: [ORDER], call: null });
    const next = withBook(state, { ...book, jpy: 850_000, orders: [] });
    expect(next.balances).toEqual({ jpy: 850_000, btc: 0.01 });
    expect(next.margin.orders).toEqual([]);
    expect(next.margin.assumptions).toEqual(state.margin.assumptions);
    expect(next.history).toEqual(state.history);
  });
});

describe("history.ts", () => {
  const settlement = {
    averagePrice: 1e7,
    gross: 5_000,
    feeCharged: 205,
    interestCharged: 80,
    profitLoss: 4_715,
  };

  it("an open fill charges nothing yet; a close fill carries the settlement (like the real trade-history)", () => {
    const open = historyOfFill({ order: ORDER, intent: "open", at: T, fee: 90 });
    expect(open).toMatchObject({
      type: "limit",
      feeOccurred: 90,
      feeCharged: 0,
      profitLoss: 0,
      interest: 0,
    });
    const closeOrder = { ...ORDER, side: "sell" as const, price: 10_500_000 };
    const close = historyOfFill({
      order: closeOrder,
      intent: "close",
      at: T,
      fee: 105,
      settlement,
    });
    expect(close).toMatchObject({
      feeOccurred: 105,
      feeCharged: 205,
      profitLoss: 4_715,
      interest: 80,
    });
    expect(MarginHistoryEntrySchema.safeParse(close).success).toBe(true);
  });

  it("a losscut close is recorded as type losscut on the opposite side of the position", () => {
    const position = {
      pair: "btc_jpy",
      positionSide: "short" as const,
      openAmount: 0.1,
      product: 1e6,
      unrealizedFee: 0,
      unrealizedInterest: 0,
      openedAt: T,
      lastInterestAt: T,
    };
    const e = historyOfLosscut({ position, price: 12_000_000, fee: 1_440, settlement }, "lc1", T);
    expect(e).toMatchObject({
      id: "lc1",
      side: "buy",
      positionSide: "short",
      type: "losscut",
      amount: 0.1,
      fillPrice: 12_000_000,
    });
    expect(MarginHistoryEntrySchema.safeParse(e).success).toBe(true);
  });
});

it("a v4 file on disk carries the margin block as plain JSON", async () => {
  await saveState(v4(), path);
  expect(JSON.parse(readFileSync(path, "utf-8")).margin.assumptions.collateral).toBe("jpy-only");
});
