// issue #27: 全 paper コマンドが meta.statePath で「どの state file を読んだか」を申告する
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { paperActiveOrders } from "../../commands/paper/active-orders.js";
import { paperAssets } from "../../commands/paper/assets.js";
import { paperCancelOrder } from "../../commands/paper/cancel-order.js";
import { paperCreateOrder } from "../../commands/paper/create-order.js";
import { paperInit } from "../../commands/paper/init.js";
import { paperPnl } from "../../commands/paper/pnl.js";
import { paperReset } from "../../commands/paper/reset.js";
import { paperTick } from "../../commands/paper/tick.js";
import { paperTradeHistory } from "../../commands/paper/trade-history.js";
import { withStatePath } from "../../paper-result.js";
import { defaultStatePath } from "../../paper-state.js";
import { mockFetchData, mockGetPairs } from "../test-helpers.js";

let dir: string;
let statePath: string;
const savedEnv = process.env.BITBANK_PAPER_STATE_PATH;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "paper-meta-"));
  statePath = join(dir, "paper-state.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (savedEnv === undefined) delete process.env.BITBANK_PAPER_STATE_PATH;
  else process.env.BITBANK_PAPER_STATE_PATH = savedEnv;
});

const tickerFetch = mockFetchData({
  sell: "5000000",
  buy: "5000000",
  high: "5000000",
  low: "5000000",
  open: "5000000",
  last: "5000000",
  vol: "1",
  timestamp: 1700000000000,
});

describe("withStatePath", () => {
  it("adds meta.statePath to a success result and keeps existing meta", () => {
    const r = withStatePath({ success: true, data: 1, meta: { source: "public" } }, "/x");
    expect(r.success && r.meta).toEqual({ source: "public", statePath: "/x" });
  });

  it("normalizes a relative statePath to an absolute path (cli/types.ts contract)", () => {
    const r = withStatePath({ success: true, data: 1 }, "./paper-state.json");
    expect(r.success && r.meta?.statePath).toBe(resolve("./paper-state.json"));
    expect(r.success && isAbsolute(r.meta?.statePath ?? "")).toBe(true);
  });

  it("leaves error results untouched", () => {
    const r = withStatePath({ success: false, error: "e" }, "/x");
    expect(r).toEqual({ success: false, error: "e" });
  });
});

describe("paper commands report meta.statePath", () => {
  it("init / assets / active-orders / trade-history / pnl / tick / reset", async () => {
    const init = await paperInit({ jpy: "1000000", statePath });
    expect(init.success && init.meta?.statePath).toBe(statePath);
    for (const r of await Promise.all([
      paperAssets({ statePath, getPairs: mockGetPairs }),
      paperActiveOrders({ statePath, getPairs: mockGetPairs }),
      paperTradeHistory({ statePath, getPairs: mockGetPairs }),
      paperPnl({
        statePath,
        getPairs: mockGetPairs,
        fetchTicker: async () => ({ success: true, data: 1 }),
      }),
      paperTick({ statePath, getPairs: mockGetPairs }),
    ])) {
      expect(r.success && r.meta?.statePath).toBe(statePath);
    }
    const reset = await paperReset({ confirm: true, statePath });
    expect(reset.success && reset.meta?.statePath).toBe(statePath);
  });

  it("create-order (market / limit) and cancel-order", async () => {
    await paperInit({ jpy: "1000000", statePath });
    const base = { pair: "btc_jpy", side: "buy", statePath, getPairs: mockGetPairs, feeRate: 0 };
    const opts = { fetch: tickerFetch, retries: 0 };
    const mkt = await paperCreateOrder({ ...base, type: "market", amount: "0.001" }, opts);
    expect(mkt.success && mkt.meta?.statePath).toBe(statePath);
    const lim = await paperCreateOrder(
      { ...base, type: "limit", amount: "0.001", price: "1000000" },
      opts,
    );
    expect(lim.success && lim.meta?.statePath).toBe(statePath);
    if (!lim.success || !("placed" in lim.data)) throw new Error("limit not placed");
    const cancel = await paperCancelOrder({
      id: lim.data.placed.id,
      statePath,
      getPairs: mockGetPairs,
    });
    expect(cancel.success && cancel.meta?.statePath).toBe(statePath);
  });

  it("falls back to the default path (BITBANK_PAPER_STATE_PATH) when statePath is omitted", async () => {
    process.env.BITBANK_PAPER_STATE_PATH = statePath;
    expect(defaultStatePath()).toBe(statePath);
    await paperInit({ jpy: "1000000" });
    const r = await paperAssets({ getPairs: mockGetPairs });
    expect(r.success && r.meta?.statePath).toBe(statePath);
  });
});
