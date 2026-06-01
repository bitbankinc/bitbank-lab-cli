// 100行超: リトライ判定・指数バックオフ＋ジッター・fetch 本体を一箇所に集約しているため。
import { apiErrorExitCode, classifyHttpError, formatApiError } from "./error-codes.js";
import { sanitizeErrorMessage } from "./error-sanitize.js";
import { EXIT, type ExitCode } from "./exit-codes.js";
import { extractRateLimit } from "./rate-limit.js";
import { type Bucket, detectBucket, updateRateLimit, waitForSlot } from "./throttle.js";
import type { Result } from "./types.js";

export { ERROR_CODES, apiErrorExitCode, formatApiError } from "./error-codes.js";

export function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500;
}
const BASE_DELAY_MS = 500; // 指数バックオフのベース遅延（ms）
function parseRetryAfter(v: string): number | null {
  if (/^\d+$/.test(v)) return Number(v) * 1000;
  const ts = /[a-z]/i.test(v) ? Date.parse(v) : Number.NaN;
  return ts > 0 ? Math.max(0, ts - Date.now()) : null;
}
function jitter(ms: number): number {
  // ±25% のジッターでリトライ同期（thundering herd）を防ぐ
  const range = ms * 0.25;
  return ms + (Math.random() * 2 - 1) * range;
}
export async function retryDelay(res: Response | null, attempt: number): Promise<void> {
  const after = res?.status === 429 ? res.headers.get("Retry-After") : null;
  const base = (after ? parseRetryAfter(after) : null) ?? 2 ** attempt * BASE_DELAY_MS;
  const ms = Math.max(0, jitter(base));
  await new Promise((r) => setTimeout(r, ms));
}

export type BaseFetchOptions = {
  timeoutMs?: number;
  retries?: number;
  fetch?: typeof globalThis.fetch;
  /** プロアクティブスロットルの最小インターバル(ms)。省略時はバケット既定値 */
  throttleMs?: number;
  /** false にするとネットワーク例外で再試行しない（POST の冪等性確保用） */
  retryOnNetworkError?: boolean;
  /** public（無認証）経路フラグ。403 を AUTH ではなく GENERAL に分類する */
  isPublic?: boolean;
};

type Attempt<T> =
  | { kind: "done"; result: Result<T> }
  | { kind: "retry"; res: Response | null; error: string; exitCode: ExitCode };

async function attemptOnce<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchFn: typeof globalThis.fetch,
  parseError: (body: { data?: { code?: number } }) => string,
  bucket: Bucket,
  isPublic: boolean,
): Promise<Attempt<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { ...init, signal: controller.signal });

    if (!res.ok) {
      if (shouldRetry(res.status)) {
        const error = `HTTP ${res.status}: ${res.statusText}`;
        // 429 は retry を尽くしても rate-limit として返す（5xx は GENERAL のまま）。
        const exitCode = res.status === 429 ? EXIT.RATE_LIMIT : EXIT.GENERAL;
        return { kind: "retry", res, error, exitCode };
      }
      // 401/403 の exit code と public 403 のヒント付与は classifyHttpError に集約。
      const { error, exitCode } = classifyHttpError(res.status, res.statusText, isPublic);
      return { kind: "done", result: { success: false, error, exitCode } };
    }
    const body = await res.json();
    if (body.success !== 1) {
      const code = body.data?.code ?? 0;
      const error = parseError(body);
      return { kind: "done", result: { success: false, error, exitCode: apiErrorExitCode(code) } };
    }
    const rl = extractRateLimit(res.headers);
    updateRateLimit(bucket, rl);
    const result: Result<T> = {
      success: true,
      data: body.data as T,
      ...(rl && { meta: { rateLimit: rl } }),
    };
    return { kind: "done", result };
  } catch (e) {
    return { kind: "retry", res: null, error: sanitizeErrorMessage(e), exitCode: EXIT.NETWORK };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWithRetry<T>(
  url: string,
  init: RequestInit,
  opts: BaseFetchOptions,
  parseError: (body: { data?: { code?: number } }) => string,
): Promise<Result<T>> {
  const { timeoutMs = 5000, retries = 2, fetch: fetchFn = globalThis.fetch } = opts;
  const isPublic = opts.isPublic ?? false;
  const bucket = detectBucket(url);
  let lastError = "";
  let lastExitCode: ExitCode = EXIT.GENERAL;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt === 0) await waitForSlot(bucket, opts.throttleMs);
    const r = await attemptOnce<T>(url, init, timeoutMs, fetchFn, parseError, bucket, isPublic);
    if (r.kind === "done") return r.result;
    lastError = r.error;
    lastExitCode = r.exitCode;
    if (r.res === null && opts.retryOnNetworkError === false) break;
    if (attempt < retries) await retryDelay(r.res, attempt + 1);
  }
  return { success: false, error: lastError, exitCode: lastExitCode };
}
