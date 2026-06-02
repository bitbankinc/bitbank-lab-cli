// 100行超: paper-state-mutate の lock がない世界の race（lost update /
// 履歴欠落）を 2 方向から検証する。
// - in-process: Promise.all で N 個の paperCreateOrder を並行
// - cross-process: spawn で paper create-order と paper tick を並行
import { spawn } from "node:child_process";
import { type WriteFileOptions, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { paperCancelOrder } from "../../commands/paper/cancel-order.js";
import { paperCreateOrder } from "../../commands/paper/create-order.js";
import { paperInit } from "../../commands/paper/init.js";
import { paperTick } from "../../commands/paper/tick.js";
import type { FetchCandles } from "../../paper-fill.js";
import { loadState } from "../../paper-state.js";
import { MOCK_PAIRS, mockGetPairs } from "../test-helpers.js";

const noCandles: FetchCandles = async () => ({ success: true, data: [] });

let dir: string;
let statePath: string;
let pairsCachePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "paper-concurrent-"));
  statePath = join(dir, "paper-state.json");
  pairsCachePath = join(dir, "pairs-cache.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("paper updateState in-process concurrency", () => {
  it("N parallel limit place: all orders persisted (no lost update)", async () => {
    await paperInit({ jpy: "1000000000", statePath });
    const N = 10;
    const tasks = Array.from({ length: N }, (_, i) =>
      paperCreateOrder({
        pair: "btc_jpy",
        side: "buy",
        type: "limit",
        price: String(1000000 + i),
        amount: "0.001",
        feeRate: 0,
        statePath,
        fetchCandles: noCandles,
        getPairs: mockGetPairs,
      }),
    );
    const results = await Promise.all(tasks);
    for (const r of results) expect(r.success).toBe(true);
    const after = await loadState(statePath);
    if (!after.success || !after.data) throw new Error("state missing");
    expect(after.data.openOrders).toHaveLength(N);
    const prices = after.data.openOrders.map((o) => o.price).sort();
    const expectedPrices = Array.from({ length: N }, (_, i) => 1000000 + i).sort();
    expect(prices).toEqual(expectedPrices);
  });

  it("create-order parallel with tick: filled history is preserved", async () => {
    await paperInit({ jpy: "100000000", statePath });
    // 1) Place a limit order that the upcoming tick will fill.
    const placed = await paperCreateOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.001",
      feeRate: 0,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    expect(placed.success).toBe(true);
    if (!placed.success || !("placed" in placed.data)) throw new Error("expected placed");
    const orderTs = Date.parse(placed.data.placed.createdAt);
    const fillingFc: FetchCandles = async () => ({
      success: true,
      data: [
        {
          open: 5000000,
          high: 5000000,
          low: 4900000,
          close: 4950000,
          vol: 0,
          timestamp: orderTs + 60_000,
        },
      ],
    });
    // 2) Run tick (fills the btc order) and add a new eth order concurrently.
    const [tickR, createR] = await Promise.all([
      paperTick({
        statePath,
        fetchCandles: fillingFc,
        getPairs: mockGetPairs,
        nowMs: orderTs + 120_000,
        feeRate: 0,
      }),
      paperCreateOrder({
        pair: "eth_jpy",
        side: "buy",
        type: "limit",
        price: "300000",
        amount: "0.01",
        feeRate: 0,
        statePath,
        fetchCandles: noCandles,
        getPairs: mockGetPairs,
      }),
    ]);
    expect(tickR.success).toBe(true);
    expect(createR.success).toBe(true);
    const after = await loadState(statePath);
    if (!after.success || !after.data) throw new Error("state missing");
    // History must contain the btc fill (no lost-write from create-order).
    expect(after.data.history).toHaveLength(1);
    expect(after.data.history[0].pair).toBe("btc_jpy");
    expect(after.data.history[0].fillPrice).toBe(5000000);
    // openOrders must contain the new eth order (no lost-write from tick).
    expect(after.data.openOrders).toHaveLength(1);
    expect(after.data.openOrders[0].pair).toBe("eth_jpy");
  });

  it("create-order parallel with cancel-order: both effects land", async () => {
    await paperInit({ jpy: "100000000", statePath });
    const placed = await paperCreateOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.001",
      feeRate: 0,
      statePath,
      fetchCandles: noCandles,
      getPairs: mockGetPairs,
    });
    if (!placed.success || !("placed" in placed.data)) throw new Error("expected placed");
    const cancelId = placed.data.placed.id;
    const [cancelR, createR] = await Promise.all([
      paperCancelOrder({ id: cancelId, statePath, fetchCandles: noCandles }),
      paperCreateOrder({
        pair: "eth_jpy",
        side: "buy",
        type: "limit",
        price: "300000",
        amount: "0.01",
        feeRate: 0,
        statePath,
        fetchCandles: noCandles,
        getPairs: mockGetPairs,
      }),
    ]);
    expect(cancelR.success).toBe(true);
    expect(createR.success).toBe(true);
    const after = await loadState(statePath);
    if (!after.success || !after.data) throw new Error("state missing");
    const ids = after.data.openOrders.map((o) => o.id);
    expect(ids).not.toContain(cancelId);
    expect(after.data.openOrders).toHaveLength(1);
    expect(after.data.openOrders[0].pair).toBe("eth_jpy");
  });
});

function seedPairsCache(path: string): void {
  const content = JSON.stringify({
    version: 1,
    fetchedAt: new Date(Date.now()).toISOString(),
    pairs: MOCK_PAIRS,
  });
  const opts: WriteFileOptions = { mode: 0o600 };
  writeFileSync(path, content, opts);
}

type SpawnResult = { code: number; stdout: string; stderr: string };

function spawnCmd(args: string[], env: NodeJS.ProcessEnv): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", "cli/index.ts", ...args], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.on("error", (err) => reject(err));
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

describe("paper updateState cross-process concurrency", () => {
  it("N parallel limit place across spawned CLIs: all orders persisted", async () => {
    seedPairsCache(pairsCachePath);
    const baseEnv = {
      BITBANK_PAPER_STATE_PATH: statePath,
      BITBANK_PAIRS_CACHE_PATH: pairsCachePath,
    };
    // bootstrap state with init from a single process.
    const initR = await spawnCmd(["paper", "init", "--jpy=1000000000"], baseEnv);
    expect(initR.code).toBe(0);
    const N = 4;
    const tasks = Array.from({ length: N }, (_, i) =>
      spawnCmd(
        [
          "paper",
          "create-order",
          "--pair=btc_jpy",
          "--side=buy",
          "--type=limit",
          `--price=${1000000 + i}`,
          "--amount=0.001",
        ],
        baseEnv,
      ),
    );
    const results = await Promise.all(tasks);
    for (const r of results) {
      expect(r.code, `exit non-zero. stderr=${r.stderr}`).toBe(0);
    }
    const raw = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(raw.openOrders).toHaveLength(N);
    const prices = (raw.openOrders as Array<{ price: number }>).map((o) => o.price).sort();
    expect(prices).toEqual(Array.from({ length: N }, (_, i) => 1000000 + i).sort());
  }, 60_000);
});
