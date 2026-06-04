// 100行超: pairs cache の hit / miss / TTL / refresh / 0600 を網羅
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type CachedPair,
  getPairsWithCache,
  loadPairsCache,
  PAIRS_CACHE_TTL_MS,
  type PairsCacheEntry,
  savePairsCache,
} from "../pairs-cache.js";
import type { Result } from "../types.js";

let dir: string;
let cachePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pairs-cache-"));
  cachePath = join(dir, "pairs-cache.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const samplePair: CachedPair = {
  name: "btc_jpy",
  base_asset: "btc",
  quote_asset: "jpy",
  maker_fee_rate_base: 0,
  taker_fee_rate_base: 0,
  maker_fee_rate_quote: 0,
  taker_fee_rate_quote: 0.0012,
  unit_amount: 0.0001,
  limit_max_amount: 1000,
  market_max_amount: 100,
  price_digits: 0,
  amount_digits: 4,
  is_enabled: true,
  stop_order: false,
  stop_order_and_cancel: false,
};

function makeEntry(fetchedAt: string, pairs: CachedPair[] = [samplePair]): PairsCacheEntry {
  return { version: 1, fetchedAt, pairs };
}

function trackingFetch(pairs: CachedPair[]): {
  fn: () => Promise<Result<CachedPair[]>>;
  calls: () => number;
} {
  let calls = 0;
  return {
    fn: async () => {
      calls++;
      return { success: true, data: pairs };
    },
    calls: () => calls,
  };
}

describe("pairs-cache: round-trip", () => {
  it("saves and loads the same entry", async () => {
    const e = makeEntry("2025-01-01T00:00:00.000Z");
    const w = await savePairsCache(e, cachePath);
    expect(w.success).toBe(true);
    const r = await loadPairsCache(cachePath);
    expect(r.success).toBe(true);
    if (r.success && r.data) expect(r.data).toEqual(e);
  });

  it("loadPairsCache returns null when file missing", async () => {
    const r = await loadPairsCache(cachePath);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(null);
  });

  it("treats malformed JSON as cache miss (fallback to refetch)", async () => {
    writeFileSync(cachePath, "not json");
    const r = await loadPairsCache(cachePath);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(null);
  });

  it("treats stale-schema cache as cache miss (fallback to refetch)", async () => {
    // 旧 schema (*_fee_rate_base_quote) が手元に残っている前提
    writeFileSync(
      cachePath,
      JSON.stringify({
        version: 1,
        fetchedAt: "2025-01-01T00:00:00.000Z",
        pairs: [
          {
            name: "btc_jpy",
            base_asset: "btc",
            quote_asset: "jpy",
            maker_fee_rate_base_quote: 0,
            taker_fee_rate_base_quote: 0.001,
            unit_amount: 0.0001,
            limit_max_amount: 1000,
            market_max_amount: 10,
            price_digits: 0,
            amount_digits: 4,
            is_enabled: true,
            stop_order: false,
            stop_order_and_cancel: false,
          },
        ],
      }),
    );
    const r = await loadPairsCache(cachePath);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(null);
  });

  it("saves file with 0600 mode (owner read/write only)", async () => {
    const e = makeEntry("2025-01-01T00:00:00.000Z");
    await savePairsCache(e, cachePath);
    const mode = statSync(cachePath).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

describe("getPairsWithCache: hit / miss / TTL / refresh", () => {
  it("cache miss → fetches and writes cache", async () => {
    const { fn, calls } = trackingFetch([samplePair]);
    const r = await getPairsWithCache({
      path: cachePath,
      fetchPairs: fn,
      nowMs: Date.parse("2025-01-01T00:00:00.000Z"),
    });
    expect(r.success).toBe(true);
    expect(calls()).toBe(1);
    const raw = JSON.parse(readFileSync(cachePath, "utf-8"));
    expect(raw.pairs[0].name).toBe("btc_jpy");
  });

  it("cache hit within TTL → does not call fetch", async () => {
    const fresh = "2025-01-01T00:00:00.000Z";
    await savePairsCache(makeEntry(fresh), cachePath);
    const { fn, calls } = trackingFetch([]);
    const r = await getPairsWithCache({
      path: cachePath,
      fetchPairs: fn,
      nowMs: Date.parse("2025-01-01T12:00:00.000Z"),
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data[0].name).toBe("btc_jpy");
    expect(calls()).toBe(0);
  });

  it("cache expired (> TTL) → re-fetches", async () => {
    const old = "2025-01-01T00:00:00.000Z";
    await savePairsCache(makeEntry(old, [{ ...samplePair, unit_amount: 0.00001 }]), cachePath);
    const newPair: CachedPair = { ...samplePair, unit_amount: 0.0001 };
    const { fn, calls } = trackingFetch([newPair]);
    const r = await getPairsWithCache({
      path: cachePath,
      fetchPairs: fn,
      nowMs: Date.parse(old) + PAIRS_CACHE_TTL_MS + 1,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data[0].unit_amount).toBe(0.0001);
    expect(calls()).toBe(1);
  });

  it("--refresh-pairs (refresh=true) bypasses cache even if fresh", async () => {
    const fresh = "2025-01-01T00:00:00.000Z";
    await savePairsCache(makeEntry(fresh, [{ ...samplePair, unit_amount: 0.001 }]), cachePath);
    const { fn, calls } = trackingFetch([{ ...samplePair, unit_amount: 0.0001 }]);
    const r = await getPairsWithCache({
      path: cachePath,
      fetchPairs: fn,
      refresh: true,
      nowMs: Date.parse("2025-01-01T01:00:00.000Z"),
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data[0].unit_amount).toBe(0.0001);
    expect(calls()).toBe(1);
    const raw = JSON.parse(readFileSync(cachePath, "utf-8"));
    expect(raw.pairs[0].unit_amount).toBe(0.0001);
  });

  it("stale-schema cache → re-fetches and overwrites with new shape", async () => {
    writeFileSync(
      cachePath,
      JSON.stringify({
        version: 1,
        fetchedAt: "2025-01-01T00:00:00.000Z",
        pairs: [
          {
            name: "btc_jpy",
            maker_fee_rate_base_quote: 0,
            taker_fee_rate_base_quote: 0.001,
          },
        ],
      }),
    );
    const { fn, calls } = trackingFetch([samplePair]);
    const r = await getPairsWithCache({
      path: cachePath,
      fetchPairs: fn,
      nowMs: Date.parse("2025-01-01T00:00:00.000Z"),
    });
    expect(r.success).toBe(true);
    expect(calls()).toBe(1);
    const raw = JSON.parse(readFileSync(cachePath, "utf-8"));
    expect(raw.pairs[0].taker_fee_rate_quote).toBe(0.0012);
    expect(raw.pairs[0].maker_fee_rate_base_quote).toBeUndefined();
  });

  it("propagates fetch error without writing cache", async () => {
    const r = await getPairsWithCache({
      path: cachePath,
      fetchPairs: async () => ({ success: false, error: "upstream down" }),
    });
    expect(r.success).toBe(false);
    const r2 = await loadPairsCache(cachePath);
    expect(r2.success).toBe(true);
    if (r2.success) expect(r2.data).toBe(null);
  });
});
