import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { paperCreateOrder } from "../../commands/paper/create-order.js";
import { paperInit } from "../../commands/paper/init.js";
import { paperTradeHistory } from "../../commands/paper/trade-history.js";
import { mockFetchData, mockGetPairs } from "../test-helpers.js";

const ticker = mockFetchData({
  sell: "5000000",
  buy: "5000000",
  high: "5000000",
  low: "5000000",
  open: "5000000",
  last: "5000000",
  vol: "10",
  timestamp: 1700000000000,
});

let dir: string;
let statePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "paper-th-"));
  statePath = join(dir, "paper-state.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("paper trade-history", () => {
  it("returns empty history right after init", async () => {
    await paperInit({ jpy: "1000000", statePath });
    const r = await paperTradeHistory({ statePath });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual([]);
  });

  it("returns recorded fills", async () => {
    await paperInit({ jpy: "1000000", statePath });
    await paperCreateOrder(
      {
        pair: "btc_jpy",
        side: "buy",
        type: "market",
        amount: "0.001",
        feeRate: 0,
        statePath,
        getPairs: mockGetPairs,
      },
      { fetch: ticker, retries: 0 },
    );
    const r = await paperTradeHistory({ statePath });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toHaveLength(1);
    expect(r.data[0].pair).toBe("btc_jpy");
    expect(r.data[0].side).toBe("buy");
  });

  it("returns Err when not initialized", async () => {
    const r = await paperTradeHistory({ statePath });
    expect(r.success).toBe(false);
  });
});
