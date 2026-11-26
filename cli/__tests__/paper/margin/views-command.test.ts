import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { paperCreateMarginOrder } from "../../../commands/paper/create-margin-order.js";
import { paperInit } from "../../../commands/paper/init.js";
import { paperMarginPositions } from "../../../commands/paper/margin-positions.js";
import { paperMarginStatus } from "../../../commands/paper/margin-status.js";
import { EXIT } from "../../../exit-codes.js";
import type { CachedPair } from "../../../pairs-cache.js";
import type { FetchCandles } from "../../../paper-fill.js";
import { MOCK_PAIRS } from "../../test-helpers.js";

const T0 = Date.parse("2026-11-02T00:00:00Z");
const BTC: CachedPair = {
  ...MOCK_PAIRS[0],
  margin_open_maker_fee_rate_quote: 0,
  margin_open_taker_fee_rate_quote: 0.001,
  margin_close_maker_fee_rate_quote: 0,
  margin_close_taker_fee_rate_quote: 0.001,
  margin_long_interest: 0.0004,
  margin_short_interest: 0.0004,
  margin_current_individual_ratio: 0.5,
  margin_current_individual_until: 253402300799999,
  stop_margin_long_order: false,
  stop_margin_short_order: false,
};
const LTC: CachedPair = {
  ...MOCK_PAIRS[0],
  name: "ltc_jpy",
  margin_current_individual_ratio: null,
};
const getPairs = async () => ({ success: true as const, data: [BTC, LTC] });
const flat: FetchCandles = async (_p, from, to) => ({
  success: true,
  data: [{ timestamp: T0 + 60_000, open: 1e7, high: 1e7, low: 1e7, close: 1e7, vol: 1 }].filter(
    (c) => c.timestamp >= from && c.timestamp <= to,
  ),
});
const tickers = (last: number) => ({
  fetch: async () =>
    new Response(
      JSON.stringify({
        success: 1,
        data: {
          sell: `${last}`,
          buy: `${last}`,
          high: `${last}`,
          low: `${last}`,
          open: `${last}`,
          last: `${last}`,
          vol: "1",
          timestamp: 1,
        },
      }),
    ),
  retries: 0,
});

let dir: string;
let statePath: string;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "paper-margin-views-"));
  statePath = join(dir, "paper-state.json");
  // paperInit は実時計で state を作るので、テストの時刻（T0）に揃えてから作る（実行日時で結果を変えない）
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(T0));
  await paperInit({ jpy: "1000000", statePath });
  const r = await paperCreateMarginOrder(
    {
      pair: "btc_jpy",
      side: "buy",
      positionSide: "long",
      type: "market",
      amount: "0.01",
      statePath,
      getPairs,
      fetchCandles: flat,
      nowMs: T0,
    },
    tickers(10_000_000),
  );
  if (!r.success) throw new Error(r.error);
});
afterEach(() => {
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

const later = () => ({ statePath, getPairs, fetchCandles: flat, nowMs: T0 + 5 * 60_000 });

describe("paper margin-status / margin-positions commands", () => {
  it("margin-status evaluates at the live last and lists only margin pairs", async () => {
    const r = await paperMarginStatus(later(), tickers(11_000_000));
    if (!r.success) throw new Error(r.error);
    expect(r.data.margin_position_profit_loss).toBe(10_000); // (11,000,000 − 10,000,000) × 0.01
    expect(r.data.available_balances.map((b) => b.pair)).toEqual(["btc_jpy"]);
    expect(r.data.stale).toBe(false);
    expect(r.data.last_scan_at).toBe(new Date(T0 + 5 * 60_000).toISOString()); // T0 から now まで走査した
    expect(r.meta?.statePath).toBe(statePath);
  });

  it("margin-status says stale when the lazy tick could not fetch candles", async () => {
    const failing: FetchCandles = async () => ({ success: false, error: "boom" });
    const r = await paperMarginStatus({ ...later(), fetchCandles: failing }, tickers(10_000_000));
    expect(r.success && r.data.stale).toBe(true);
  });

  it("margin-positions shows the position and validates --pair", async () => {
    const r = await paperMarginPositions(later(), tickers(9_000_000));
    if (!r.success) throw new Error(r.error);
    expect(r.data.positions[0]).toMatchObject({
      open_amount: 0.01,
      average_price: 10_000_000,
      unrealized_profit_loss: -10_000,
    });
    const bad = await paperMarginPositions({ ...later(), pair: "nope" }, tickers(9_000_000));
    expect(!bad.success && bad.exitCode).toBe(EXIT.PARAM);
  });
});
