// 100行超: pairs cache の hit / miss / TTL / refresh / 0600 / version 移行を網羅
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type CachedPair,
  getPairsWithCache,
  loadPairsCache,
  PAIRS_CACHE_TTL_MS,
  PAIRS_CACHE_VERSION,
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
  return { version: PAIRS_CACHE_VERSION, fetchedAt, pairs };
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

// 信用取引フィールド（ADR-010）。v1 のキャッシュは margin_* を持たないので、読み続けると
// 全ペアが「信用情報なし」に見える。version 不一致で cache miss にして取り直させる。
const marginPair: CachedPair = {
  ...samplePair,
  margin_open_maker_fee_rate_quote: 0,
  margin_open_taker_fee_rate_quote: 0.001,
  margin_close_maker_fee_rate_quote: 0,
  margin_close_taker_fee_rate_quote: 0.001,
  margin_long_interest: 0.0004,
  margin_short_interest: 0.0004,
  margin_current_individual_ratio: 0.5,
  margin_current_individual_until: 1785250799999,
  margin_current_company_ratio: 0.0818,
  margin_current_company_until: 1785250799999,
  margin_next_individual_ratio: 0.5,
  margin_next_individual_until: 1785855599999,
  margin_next_company_ratio: 0.0818,
  margin_next_company_until: 1785855599999,
  stop_margin_long_order: false,
  stop_margin_short_order: false,
};

describe("pairs-cache: margin fields (v2)", () => {
  it("v1 cache with an otherwise valid shape is a cache miss and gets re-fetched", async () => {
    const fresh = "2025-01-01T00:00:00.000Z";
    writeFileSync(cachePath, JSON.stringify({ version: 1, fetchedAt: fresh, pairs: [samplePair] }));
    const loaded = await loadPairsCache(cachePath);
    expect(loaded.success && loaded.data).toBe(null);
    const { fn, calls } = trackingFetch([marginPair]);
    const r = await getPairsWithCache({
      path: cachePath,
      fetchPairs: fn,
      nowMs: Date.parse("2025-01-01T01:00:00.000Z"),
    });
    expect(calls()).toBe(1);
    if (r.success) expect(r.data[0].margin_current_individual_ratio).toBe(0.5);
    const raw = JSON.parse(readFileSync(cachePath, "utf-8"));
    expect(raw.version).toBe(PAIRS_CACHE_VERSION);
  });

  it("round-trips margin values and keeps null (non-margin pair) as null", async () => {
    const nonMargin: CachedPair = {
      ...samplePair,
      name: "ltc_jpy",
      margin_current_individual_ratio: null,
      margin_long_interest: null,
      stop_margin_long_order: false,
    };
    const e = makeEntry("2025-01-01T00:00:00.000Z", [marginPair, nonMargin]);
    await savePairsCache(e, cachePath);
    const r = await loadPairsCache(cachePath);
    if (!r.success || !r.data) throw new Error("the current-format cache must load back");
    expect(r.data.pairs[0]).toEqual(marginPair);
    expect(r.data.pairs[1].margin_current_individual_ratio).toBe(null);
    expect(r.data.pairs[1].margin_long_interest).toBe(null);
  });

  it("keeps a pair without margin fields loadable (absent stays undefined, not null)", async () => {
    await savePairsCache(makeEntry("2025-01-01T00:00:00.000Z"), cachePath);
    const r = await loadPairsCache(cachePath);
    if (!r.success || !r.data) throw new Error("the current-format cache must load back");
    expect(r.data.pairs[0].margin_current_individual_ratio).toBeUndefined();
    expect("margin_current_individual_ratio" in r.data.pairs[0]).toBe(false);
  });
});
