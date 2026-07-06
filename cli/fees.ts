// 100行超: 手数料の解決(resolveFeeRate/feeRole/makerRateResolver)と
// dry-run 見積り(estimateOrderFee/resolveDryRunFee)、約定の手数料・残高計算
// (computeFill)を1モジュールに集約するため。
// CLI 共通の手数料リゾルバ。手数料データは public の /spot/pairs 由来
// （CachedPair の maker/taker fee_rate_quote）。paper と実 trade dry-run の
// 両方で同じ解決ロジックを共有するため、paper 専用ではなく CLI 共通モジュールに置く。
import { type CachedPair, getPairsWithCache } from "./pairs-cache.js";
import type { DryRunFee, Result } from "./types.js";

// API 不在 / ペア未発見時の保守的フォールバック。過去の公称 taker 上限 0.12% に
// 合わせた値で、現行の公称レートではない（レートはペア・時期で改定される。
// 例: BTC/JPY は 2026-02 時点で maker 0.00% / taker 0.10%）。
// 現行レートは常に /spot/pairs の取得値が優先される。参考: https://bitbank.cc/guide/fee
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

export type FillMath = { feeQuote: number; cost: number; proceeds: number };

/** notional から手数料・支払・受取を quote 建てで算出。JPY のみ丸め。 */
export function computeFill(notional: number, feeRate: number, quote: string): FillMath {
  const isJpy = quote === "jpy";
  const round = (n: number) => (isJpy ? Math.round(n) : n);
  const rawFee = notional * feeRate;
  return {
    feeQuote: round(rawFee),
    cost: round(notional + rawFee),
    proceeds: round(notional - rawFee),
  };
}

/** dry-run 見積りに必要な注文情報（create-order の parsed.data 部分集合）。 */
export type FeeOrder = {
  pair: string;
  side: "buy" | "sell";
  type: string;
  amount: string;
  price?: string;
  postOnly?: boolean;
};

/** pairs 取得の注入 seam（テストで実 API を叩かないため）。paper の GetPairs と同形。 */
export type GetPairs = () => Promise<Result<CachedPair[]>>;

/**
 * 解決済みの pair（無ければ undefined）から手数料見積りを組む純関数。
 * - role/rate は常に出す（rate は resolveFeeRate のフォールバック規約に従う）
 * - estimated* は limit / stop_limit かつ price 既知のときだけ。market / stop は
 *   約定価格依存なので率だけ返す（クランプ禁止。maker リベートの負値はそのまま）
 * - quote が jpy なら四捨五入、それ以外は quote 建てのまま
 */
export function estimateOrderFee(pair: CachedPair | undefined, order: FeeOrder): DryRunFee {
  const role = feeRole(order.type, order.postOnly);
  const rate = resolveFeeRate(pair, role);
  const priceKnown =
    (order.type === "limit" || order.type === "stop_limit") && order.price !== undefined;
  if (!priceKnown) {
    return { role, rate, note: "成行/逆指値: 約定価格依存のため JPY 見積りは省略（手数料率のみ）" };
  }
  const isJpy = (pair?.quote_asset ?? order.pair.split("_")[1]) === "jpy";
  const notional = Number(order.price) * Number(order.amount);
  const rawFee = notional * rate;
  const feeQuote = isJpy ? Math.round(rawFee) : rawFee;
  const gross = order.side === "buy" ? notional + feeQuote : notional - feeQuote;
  const note = order.postOnly
    ? "post_only につき maker 確定"
    : "maker は想定。指値が板を跨いで約定すると taker 手数料になる";
  return {
    role,
    rate,
    estimatedFeeQuote: feeQuote,
    estimatedCostQuote: isJpy ? Math.round(gross) : gross,
    note,
  };
}

/**
 * dry-run の手数料見積りを解決する。public の /spot/pairs を 1 回だけ引く
 * （キャッシュ済み・private/POST は叩かない）。getPairs 注入時はそれを使う。
 * pairs 取得失敗 / 対象ペア未発見でも見積りは止めず、既定フォールバック率で概算した
 * 旨を note に足して返す（オフラインでも dry-run を壊さない）。
 */
export async function resolveDryRunFee(order: FeeOrder, getPairs?: GetPairs): Promise<DryRunFee> {
  const r = getPairs ? await getPairs() : await getPairsWithCache();
  const pair = r.success ? r.data.find((p) => p.name === order.pair) : undefined;
  const fee = estimateOrderFee(pair, order);
  if (pair) return fee;
  const fallback = "ライブ手数料率を取得できず既定フォールバック率(0.12%)で概算";
  return { ...fee, note: fee.note ? `${fee.note}; ${fallback}` : fallback };
}
