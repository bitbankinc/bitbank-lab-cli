import type { CachedPair } from "../pairs-cache.js";
import type { Result } from "../types.js";

/** body 全体を返す mockFetch（http レイヤーテスト用） */
export function mockFetchRaw(body: unknown, status = 200): typeof globalThis.fetch {
  return async () => new Response(JSON.stringify(body), { status });
}

/** data を { success: 1, data } でラップして返す mockFetch（コマンドテスト用） */
export function mockFetchData(data: unknown): typeof globalThis.fetch {
  return async () => new Response(JSON.stringify({ success: 1, data }));
}

/** paper create-order の unit_amount 検証用ペア定義（テスト時の既定値） */
export const MOCK_PAIRS: CachedPair[] = [
  {
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
  },
  {
    name: "eth_jpy",
    base_asset: "eth",
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
  },
];

export const mockGetPairs = async (): Promise<Result<CachedPair[]>> => ({
  success: true,
  data: MOCK_PAIRS,
});

export function mockGetPairsWith(
  overrides: Array<Partial<CachedPair> & { name: string }>,
): () => Promise<Result<CachedPair[]>> {
  const merged = MOCK_PAIRS.map((p) => {
    const ov = overrides.find((o) => o.name === p.name);
    return ov ? { ...p, ...ov } : p;
  });
  for (const ov of overrides) {
    if (!merged.some((p) => p.name === ov.name)) {
      merged.push({ ...MOCK_PAIRS[0], ...ov });
    }
  }
  return async () => ({ success: true, data: merged });
}

/** テスト用 API 認証情報 */
export const TEST_CREDS = { apiKey: "testkey", apiSecret: "testsecret" } as const;

/** stdout をキャプチャして後で読み取る */
export function captureStdout() {
  let buf = "";
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    buf += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  return {
    read: () => buf,
    restore: () => {
      process.stdout.write = orig;
    },
  };
}
