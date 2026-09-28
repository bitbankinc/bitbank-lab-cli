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
  40164: "position_side が不正（long / short のみ）",
  40167: "信用取引に対応していないペア（対応ペアは margin-status の available_balances を参照）",
  50058: "信用取引の審査が未完了（bitbank で信用取引の申込・審査が必要）",
  50059: "信用の新規注文を一時制限中（時間を置いて再試行）",
  50060: "信用の新規注文を一時制限中（時間を置いて再試行）",
  50061: "新規建て可能額を超過（margin-status の available_balances を確認）",
  50062:
    "建玉を超過（返済数量が返済可能数量 open_amount - locked_amount を超えている。margin-positions を確認）",
  50081: "信用の売り新規注文が停止中",
  50082: "信用の売り返済注文が停止中",
  50083: "信用の買い新規注文が停止中",
  50084: "信用の買い返済注文が停止中",
  60001: "残高不足",
  60019: "TakeProfit / StopLoss の side は返済方向でなければならない",
  70001: "システムエラー",
};

// 信用注文で PARAM 相当のコードは範囲外（30001〜40001）なので個別に足す。
// 範囲を 40xxx 全体に広げると出金系の 401xx（40116 等）を巻き込むため、範囲分岐は変えない。
const MARGIN_PARAM_CODES: ReadonlySet<number> = new Set([40164, 40167]);

export function apiErrorExitCode(code: number): (typeof EXIT)[keyof typeof EXIT] {
  if (code >= 20001 && code <= 20003) return EXIT.AUTH;
  if (code === 10009) return EXIT.RATE_LIMIT;
  if (code >= 30001 && code <= 40001) return EXIT.PARAM;
  if (MARGIN_PARAM_CODES.has(code)) return EXIT.PARAM;
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
