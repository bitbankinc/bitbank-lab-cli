// 100行超: 本番 margin-status と同名の欄（各欄の丸め規則つき）と paper だけの欄を 1 つの出力型にまとめ、その値を埋める。
// 欄の対応を 1 か所で読めるようにするため、型と組み立てを分けない（account.ts と同じ理由）。
//
// paper margin-status の出力（ADR-010 / docs/dev/paper-margin-plan.md §3.7）。純関数。
// - 本番と同じ意味で計算できる欄だけを本番と同じ名前（snake_case）で出し、丸めも本番の docs に合わせる（rounding.ts）
// - margin_call_percentage / losscut_percentage は本番の値の意味を実口座で確かめていないので同名では出さない。
//   代わりに公表ルールから導いた paper の判定しきい値を thresholds に出す（追証は Mm / P、強制決済は Mm × 掛け目 / P）
// - status は NORMAL / CALL / DEBT（paper の強制決済は一瞬で終わるので LOSSCUT は残らない）
// - available_balances は paper の見積り（B − Mm − Mo）/ r。本番は審査で決まるご利用可能額でも頭打ちになる。
//   追証・不足金の間と、新規建て停止中の向きは 0（create-margin-order が受け付けないので）
import type { PaperState } from "../paper-state.js";
import type { Result } from "../types.js";
import { evaluateAccount, type MarginAccount } from "./account.js";
import { bookOf, hasMarginBook, isMarginStale, marginScannedAtMs } from "./book.js";
import { newOpenCapacity } from "./new-open.js";
import type { MarginPairParams } from "./params.js";
import { ceilTo, floorTo, truncTo } from "./rounding.js";
import type { MarginCall } from "./state.js";
import { maintenanceBySide } from "./status-sides.js";

export type MarginStatusView = {
  status: "NORMAL" | "CALL" | "DEBT";
  total_margin_balance: number;
  total_margin_balance_percentage: number | null;
  margin_position_profit_loss: number;
  unrealized_cost: number;
  total_margin_position_product: number;
  open_margin_position_product: number;
  open_margin_order_product: number;
  total_position_maintenance_margin: number;
  total_long_position_maintenance_margin: number;
  total_short_position_maintenance_margin: number;
  total_open_order_maintenance_margin: number;
  total_long_open_order_maintenance_margin: number;
  total_short_open_order_maintenance_margin: number;
  available_balances: Array<{ pair: string; long: number; short: number }>;
  /** paper の判定しきい値（保証金率 %）。建玉が無ければ null */
  thresholds: {
    margin_call_below_percentage: number | null;
    losscut_below_percentage: number | null;
  };
  margin_call: MarginCall | null;
  payables: { amount: number };
  /** 信用の走査を済ませた時刻（margin.lastScanAt。現物の lastTickAt とは別） */
  last_scan_at: string;
  /** 信用の建玉・注文があるのに、直前の tick が now まで走査できなかった */
  stale: boolean;
  assumptions: PaperState["margin"]["assumptions"] & {
    riskRatios: Record<
      string,
      { ratio: number; until: string; source: MarginPairParams["riskRatioSource"] }
    >;
    valuationPrices: Record<string, number>;
  };
};

export function buildMarginStatus(
  state: PaperState,
  /** 信用対応の全ペアのパラメータ（available_balances に出す）。建玉・注文のペアは必ず含む */
  params: ReadonlyMap<string, MarginPairParams>,
  prices: ReadonlyMap<string, number>,
  nowMs: number,
): Result<MarginStatusView> {
  const book = bookOf(state);
  const riskRatio = (p: string) => params.get(p)?.riskRatio;
  const acc = evaluateAccount({
    jpy: book.jpy,
    positions: book.positions,
    openOrders: book.orders,
    riskRatio,
    price: (p) => prices.get(p),
  });
  if (!acc.success) return acc;
  const a = acc.data;
  const sides = maintenanceBySide(book, riskRatio);
  const k = state.margin.assumptions.rules.losscutMultiplier;
  const held = a.openPositionProduct;
  const pct = (x: number) => (held > 0 ? ceilTo((x / held) * 100, 2) : null);
  const pairs = [...params.keys()].sort();
  // 追証・不足金の間は新規建てを受け付けない（order-checks.ts）ので、新規建て可能額も 0 にする
  const blocked = a.payables > 0 || book.call !== null;
  const view: MarginStatusView = {
    status: a.payables > 0 ? "DEBT" : book.call ? "CALL" : "NORMAL",
    total_margin_balance: truncTo(a.totalMarginBalance, 4),
    total_margin_balance_percentage:
      a.marginRatio === null ? null : truncTo(a.marginRatio * 100, 2),
    margin_position_profit_loss: floorTo(a.positionProfitLoss, 4),
    unrealized_cost: ceilTo(a.unrealizedCost, 4),
    total_margin_position_product: truncTo(held + a.openOrderProduct, 4),
    open_margin_position_product: truncTo(held, 4),
    open_margin_order_product: truncTo(a.openOrderProduct, 4),
    total_position_maintenance_margin: ceilTo(a.positionMaintenanceMargin, 4),
    total_long_position_maintenance_margin: ceilTo(sides.position.long, 4),
    total_short_position_maintenance_margin: ceilTo(sides.position.short, 4),
    total_open_order_maintenance_margin: ceilTo(a.openOrderMaintenanceMargin, 4),
    total_long_open_order_maintenance_margin: ceilTo(sides.order.long, 4),
    total_short_open_order_maintenance_margin: ceilTo(sides.order.short, 4),
    available_balances: pairs.map((pair) => availableOf(pair, a, params.get(pair), blocked)),
    thresholds: {
      margin_call_below_percentage: pct(a.positionMaintenanceMargin),
      losscut_below_percentage: pct(a.positionMaintenanceMargin * k),
    },
    margin_call: book.call,
    payables: { amount: a.payables },
    last_scan_at: new Date(marginScannedAtMs(state)).toISOString(),
    stale: hasMarginBook(state) && isMarginStale(state, nowMs),
    assumptions: {
      ...state.margin.assumptions,
      riskRatios: Object.fromEntries(
        pairs.map((p) => {
          const x = params.get(p) as MarginPairParams;
          return [
            p,
            {
              ratio: x.riskRatio,
              until: new Date(x.riskRatioUntilMs).toISOString(),
              source: x.riskRatioSource,
            },
          ];
        }),
      ),
      valuationPrices: Object.fromEntries(prices),
    },
  };
  return { success: true, data: view };
}

/** 新規建て可能額。create-margin-order が受け付けない向き（追証・不足金の間、新規建て停止中の向き）は 0 */
function availableOf(
  pair: string,
  a: MarginAccount,
  p: MarginPairParams | undefined,
  blocked: boolean,
): { pair: string; long: number; short: number } {
  if (!p || blocked) return { pair, long: 0, short: 0 };
  const cap = truncTo(newOpenCapacity(a, p.riskRatio), 4);
  return { pair, long: p.stopNewLong ? 0 : cap, short: p.stopNewShort ? 0 : cap };
}
