// 100行超: pairs から信用パラメータを読めなくなったペア（取扱終了・欄の欠落）で、控え（margin.lastParams）を使って
// 走査・返済・表示を続けられること、控えが無ければ従来どおり失敗すること、控えでは新規建てを止めることを検査する
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { paperCreateMarginOrder } from "../../../commands/paper/create-margin-order.js";
import { paperMarginStatus } from "../../../commands/paper/margin-status.js";
import type { CachedPair } from "../../../pairs-cache.js";
import { runTick } from "../../../paper-fill.js";
import { resolveMarginParams } from "../../../paper-margin-pairs.js";
import { loadState, type PaperState } from "../../../paper-state.js";
import {
  BTC,
  candlesOf,
  longPosition,
  MIN,
  pairsOf,
  seedState,
  stateAt,
  tickerAt,
} from "./fixtures.js";

const P = Date.parse;
const LAST = "2026-11-02T00:00:00.000Z";
const T0 = P(LAST);
/** 信用の取扱を終えた btc_jpy（現物としては残る） */
const ENDED: CachedPair = { ...BTC, margin_current_individual_ratio: null };

let dir: string;
let statePath: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "paper-last-params-"));
  statePath = join(dir, "paper-state.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function load(): Promise<PaperState> {
  const r = await loadState(statePath);
  if (!r.success || !r.data) throw new Error("load failed");
  return r.data;
}

/** いったん通常の tick で控えを作り、その後 pairs が ENDED に変わった口座 */
async function seedWithKeptParams() {
  await seedState(statePath, stateAt(LAST, {}, { positions: [longPosition(LAST)] }));
  const r = await runTick({
    statePath,
    nowMs: T0 + MIN,
    fetchCandles: candlesOf([[T0 + MIN, 1e7, 1e7]]),
    getPairs: pairsOf(BTC),
  });
  if (!r.success) throw new Error(r.error);
  expect((await load()).margin.lastParams?.btc_jpy?.riskRatio).toBe(0.5);
}

const fetchCandles = candlesOf([
  [T0 + MIN, 1e7, 1e7],
  [T0 + 5 * MIN, 1e7, 1e7],
]);

describe("last-known margin params", () => {
  it("a tick keeps scanning with the kept copy and says so", async () => {
    await seedWithKeptParams();
    const r = await runTick({
      statePath,
      nowMs: T0 + 10 * MIN,
      fetchCandles,
      getPairs: pairsOf(ENDED),
    });
    if (!r.success) throw new Error(r.error);
    expect(
      r.data.warnings.some((w) => w.includes("using last-known margin params for btc_jpy")),
    ).toBe(true);
    expect((await load()).margin.lastScanAt).toBe(new Date(T0 + 10 * MIN).toISOString());
  });

  it("closing still works (opens are refused), and margin-status shows the source", async () => {
    await seedWithKeptParams();
    const base = {
      ...{ pair: "btc_jpy", positionSide: "long", type: "market", statePath, fetchCandles },
      ...{ getPairs: pairsOf(ENDED), nowMs: T0 + 10 * MIN },
    };
    const open = await paperCreateMarginOrder(
      { ...base, side: "buy", amount: "0.01" },
      tickerAt(1e7),
    );
    expect(!open.success && open.error).toContain("40167");
    const status = await paperMarginStatus(
      { statePath, fetchCandles, getPairs: pairsOf(ENDED), nowMs: T0 + 10 * MIN },
      tickerAt(1e7),
    );
    if (!status.success) throw new Error(status.error);
    expect(status.data.assumptions.riskRatios.btc_jpy?.source).toBe("last-known");
    expect(status.data.available_balances.find((x) => x.pair === "btc_jpy")).toEqual({
      pair: "btc_jpy",
      long: 0,
      short: 0,
    });
    const close = await paperCreateMarginOrder(
      { ...base, side: "sell", amount: "0.1" },
      tickerAt(1e7),
    );
    if (!close.success || !("fill" in close.data)) throw new Error(JSON.stringify(close));
    expect(close.data.position).toBe(null);
  });

  it("without a kept copy it still fails rather than guessing", async () => {
    const r = await resolveMarginParams(["btc_jpy"], {
      ...{ nowMs: T0, getPairs: pairsOf(ENDED), refreshPairs: pairsOf(ENDED) },
    });
    expect(!r.success && r.error).toContain("no margin params for btc_jpy");
  });
});
