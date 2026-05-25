// 100行超: /spot/pairs の TTL 付きキャッシュ。paper の unit_amount 検証等で
// 何度も叩かないため、~/.bitbank/pairs-cache.json に 0600 で永続化する。
// /spot/pairs は public なので、これを使っても paper の private/trade 不可
// 制約は維持される（CLAUDE.md / .claude/rules/commands.md 参照）。
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { pairs as fetchPairsApi } from "./commands/public/pairs.js";
import type { HttpOptions } from "./http.js";
import type { Result } from "./types.js";

export const PAIRS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// 保存済みキャッシュは parse 後（数値）形式。API 経由の Pair 型と structural に
// 一致するので相互代入可能。
const CachedPairSchema = z.object({
  name: z.string(),
  base_asset: z.string(),
  quote_asset: z.string(),
  maker_fee_rate_base_quote: z.number(),
  taker_fee_rate_base_quote: z.number(),
  unit_amount: z.number(),
  limit_max_amount: z.number(),
  market_max_amount: z.number(),
  is_enabled: z.boolean(),
  stop_order: z.boolean(),
  stop_order_and_cancel: z.boolean(),
});

const PairsCacheSchema = z.object({
  version: z.literal(1),
  fetchedAt: z.string(),
  pairs: z.array(CachedPairSchema),
});

export type CachedPair = z.infer<typeof CachedPairSchema>;
export type PairsCacheEntry = z.infer<typeof PairsCacheSchema>;

export function defaultPairsCachePath(): string {
  if (process.env.BITBANK_PAIRS_CACHE_PATH) return process.env.BITBANK_PAIRS_CACHE_PATH;
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg) return join(xdg, "bitbank", "pairs-cache.json");
  return join(homedir(), ".bitbank", "pairs-cache.json");
}

export async function loadPairsCache(
  path = defaultPairsCachePath(),
): Promise<Result<PairsCacheEntry | null>> {
  try {
    const buf = await readFile(path, "utf-8");
    const parsed = PairsCacheSchema.safeParse(JSON.parse(buf));
    if (!parsed.success) {
      return { success: false, error: `Invalid pairs cache: ${parsed.error.message}` };
    }
    return { success: true, data: parsed.data };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { success: true, data: null };
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Failed to read pairs cache: ${msg}` };
  }
}

export async function savePairsCache(
  entry: PairsCacheEntry,
  path = defaultPairsCachePath(),
): Promise<Result<{ saved: true }>> {
  const data = `${JSON.stringify(entry, null, 2)}\n`;
  const tmp = `${path}.${process.pid}.${Math.random().toString(36).slice(2, 10)}.tmp`;
  try {
    await mkdir(dirname(path), { recursive: true });
    const fh = await open(tmp, "w", 0o600);
    try {
      await fh.writeFile(data);
      await fh.sync();
    } finally {
      await fh.close();
    }
    await rename(tmp, path);
    return { success: true, data: { saved: true } };
  } catch (e) {
    await unlink(tmp).catch(() => {});
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Failed to write pairs cache: ${msg}` };
  }
}

export type GetPairsOptions = {
  refresh?: boolean;
  path?: string;
  nowMs?: number;
  httpOptions?: HttpOptions;
  fetchPairs?: () => Promise<Result<CachedPair[]>>;
};

export async function getPairsWithCache(opts: GetPairsOptions = {}): Promise<Result<CachedPair[]>> {
  const path = opts.path ?? defaultPairsCachePath();
  const nowMs = opts.nowMs ?? Date.now();
  if (!opts.refresh) {
    const r = await loadPairsCache(path);
    if (!r.success) return r;
    if (r.data !== null && nowMs - Date.parse(r.data.fetchedAt) < PAIRS_CACHE_TTL_MS) {
      return { success: true, data: r.data.pairs };
    }
  }
  const fetchFn = opts.fetchPairs ?? (() => fetchPairsApi(opts.httpOptions));
  const fetched = await fetchFn();
  if (!fetched.success) return fetched;
  const entry: PairsCacheEntry = {
    version: 1,
    fetchedAt: new Date(nowMs).toISOString(),
    pairs: fetched.data,
  };
  const w = await savePairsCache(entry, path);
  if (!w.success) return w;
  return { success: true, data: entry.pairs };
}
