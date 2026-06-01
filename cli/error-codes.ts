import { EXIT, type ExitCode } from "./exit-codes.js";

// 公式 errors.md と整合した和訳。完全網羅ではなく CLI が実際にハンドルする主要コードに絞る。
// https://github.com/bitbankinc/bitbank-api-docs/blob/master/errors.md
export const ERROR_CODES: Record<number, string> = {
  10000: "URL不正",
  10009: "リクエスト頻度過多",
  20001: "API認証失敗",
  20002: "APIキー不正",
  20003: "ACCESS-KEY が見つかりません",
  30001: "order-quantity 未指定",
  30006: "order-id 未指定",
  30007: "order-id 配列未指定",
  30009: "asset 未指定",
  30012: "order-price 未指定",
  40001: "order-quantity が不正",
  50003: "現在取引不可",
  50004: "注文不可（板寄せ中）",
  50009: "注文が見つかりません",
  60001: "残高不足",
  70001: "システムエラー",
};

export function apiErrorExitCode(code: number): (typeof EXIT)[keyof typeof EXIT] {
  if (code >= 20001 && code <= 20003) return EXIT.AUTH;
  if (code === 10009) return EXIT.RATE_LIMIT;
  if (code >= 30001 && code <= 40001) return EXIT.PARAM;
  return EXIT.GENERAL;
}

// public（無認証）経路で 403 を受けたときに付すヒント。public は API キー不要なので
// 403 は鍵の失敗ではなく IP/地域/WAF などネットワーク制限が原因の可能性が高い。
const PUBLIC_FORBIDDEN_HINT = "（public は API キー不要。403 は IP/地域/ネットワーク制限の可能性）";

// HTTP transport ステータス（API body code ではない）→ error 文字列と exit code。
// 401 は常に AUTH。403 は public 経路なら GENERAL（鍵の問題ではない）、private/trade は AUTH。
export function classifyHttpError(
  status: number,
  statusText: string,
  isPublic: boolean,
): { error: string; exitCode: ExitCode } {
  const base = `HTTP ${status}: ${statusText}`;
  if (status === 403 && isPublic) {
    return { error: `${base} ${PUBLIC_FORBIDDEN_HINT}`, exitCode: EXIT.GENERAL };
  }
  const exitCode = status === 401 || status === 403 ? EXIT.AUTH : EXIT.GENERAL;
  return { error: base, exitCode };
}

export function formatApiError(code: number): string {
  const msg = ERROR_CODES[code];
  return msg ? `${code}: ${msg}` : `API error: ${code}`;
}
