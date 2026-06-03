// CLI 共通の手数料リゾルバ。手数料データは public の /spot/pairs 由来
// （CachedPair の maker/taker fee_rate_quote）。paper と実 trade dry-run の
// 両方で同じ解決ロジックを共有するため、paper 専用ではなく CLI 共通モジュールに置く。
import type { CachedPair } from "./pairs-cache.js";

// bitbank 公称テイカー手数料 0.12%。API 不在 / ペア未発見時のフォールバック。
// 出典: https://bitbank.cc/docs/fees/
export const DEFAULT_TAKER_FEE_RATE = 0.0012;

/**
 * 手数料率を解決する。解決順は override ?? pair の *_fee_rate_quote ??
 * DEFAULT_TAKER_FEE_RATE。
 * - *_jpy 等でも手数料は quote 建てで引く現行モデルに合わせ _quote 側を使う
 * - override はテスト注入・明示指定用に最優先
 * - maker のリベート（負値）や campaign の 0 はクランプせずそのまま返す
 *   （?? は null/undefined のみフォールバックするので 0 は維持される）
 */
export function resolveFeeRate(
  pair: CachedPair | undefined,
  role: "maker" | "taker",
  override?: number,
): number {
  return override ?? pair?.[`${role}_fee_rate_quote`] ?? DEFAULT_TAKER_FEE_RATE;
}

/**
 * 注文タイプ（+ post_only）から手数料ロールを判定する。
 * - limit / stop_limit は板に置く側なので maker
 * - market / stop は板を取る側なので taker
 * - post_only=true は約定すれば必ず maker になるため maker を強制する
 * paper は market/limit しか渡さないが、実 trade も同じ関数で賄える。
 */
export function feeRole(type: string, postOnly?: boolean): "maker" | "taker" {
  if (postOnly === true) return "maker";
  if (type === "limit" || type === "stop_limit") return "maker";
  return "taker";
}

/**
 * pair 名 → maker レートのリゾルバを作る（買い指値ロックの見積り用）。
 * 買い指値は約定すれば必ず maker なので、ロックも maker 基準が実態に近い。
 * - override があれば全ペアでそれを返す（テスト注入・明示指定が最優先）
 * - pairs に無いペア / pairs 自体が undefined は resolveFeeRate の
 *   フォールバック（DEFAULT_TAKER_FEE_RATE, 安全側）になる
 */
export function makerRateResolver(
  pairs: CachedPair[] | undefined,
  override?: number,
): (pair: string) => number {
  const byName = new Map((pairs ?? []).map((p) => [p.name, p] as const));
  return (pair) => resolveFeeRate(byName.get(pair), "maker", override);
}
