import { type BaseFetchOptions, fetchWithRetry } from "./http-core.js";
import type { Result } from "./types.js";

const PUBLIC_BASE_URL = "https://public.bitbank.cc";
const API_BASE_URL = "https://api.bitbank.cc";

export type HttpOptions = BaseFetchOptions;

export async function publicGet<T>(path: string, opts: HttpOptions = {}): Promise<Result<T>> {
  const url = `${PUBLIC_BASE_URL}${path}`;
  return fetchWithRetry<T>(url, {}, opts, (body) => body.data?.code?.toString() ?? "API error");
}

// api.bitbank.cc 配下の認証不要エンドポイント（/v1/spot/pairs, /v1/spot/status 等）。
// market data 系の public.bitbank.cc とは別ホストなので分けている。
export async function apiPublicGet<T>(path: string, opts: HttpOptions = {}): Promise<Result<T>> {
  const url = `${API_BASE_URL}${path}`;
  return fetchWithRetry<T>(url, {}, opts, (body) => body.data?.code?.toString() ?? "API error");
}
