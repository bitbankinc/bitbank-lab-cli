// 信用注文の side × position_side → 操作ラベル / intent（ADR-009 決定 2・ADR-010 決定 2）。
// 本番の trade create-margin-order（Phase 7）と paper create-margin-order（Phase 8）が共有する。
// bitbank の API に open / close のパラメータは無く、新規建てか返済かは side と position_side の
// 組合せで決まる。それを公式 docs の対応表どおりに表示語へ写すだけの純関数であり、分析ではない
// （ADR-009）。trade / paper のどちらにも属さない位置に置き、paper から cli/commands/trade/ を
// import せずに済むようにする（docs/dev/paper-margin-plan.md §3.8）。
import { z } from "zod";
import { EXIT } from "./exit-codes.js";
import type { Result } from "./types.js";

export const PositionSideSchema = z.enum(["long", "short"]);
export const MarginIntentSchema = z.enum(["open", "close"]);

export type OrderSide = "buy" | "sell";
export type PositionSide = z.infer<typeof PositionSideSchema>;
export type MarginIntent = z.infer<typeof MarginIntentSchema>;
/** dry-run / paper の結果に載せる形（Phase 7 の DryRunData.operation と同形） */
export type MarginOperation = { label: string; intent: MarginIntent };

// 公式 docs の対応表（rest-api.md「Create new order」。ADR-009 コンテキストに転記済み）
const OPERATIONS: Record<
  PositionSide,
  Record<OrderSide, { name: string; intent: MarginIntent }>
> = {
  long: {
    buy: { name: "ロング新規建て", intent: "open" },
    sell: { name: "ロング返済", intent: "close" },
  },
  short: {
    sell: { name: "ショート新規建て", intent: "open" },
    buy: { name: "ショート返済", intent: "close" },
  },
};

const OPPOSITE: Record<OrderSide, OrderSide> = { buy: "sell", sell: "buy" };

/** 例: `marginOperation("sell", "long")` → `{ label: "ロング返済（sell × long）", intent: "close" }` */
export function marginOperation(side: OrderSide, positionSide: PositionSide): MarginOperation {
  const { name, intent } = OPERATIONS[positionSide][side];
  return { label: `${name}（${side} × ${positionSide}）`, intent };
}

/** `--intent` を受けたら、side × position_side から導いた intent と突き合わせる。
 *  API には送らない CLI 側だけのクロスチェックで、`--intent` 省略時は常に通す（必須にしない）。
 *  食い違ったら、意図した操作に必要な `--side` を添えて PARAM で止める。 */
export function checkMarginIntent(
  side: OrderSide,
  positionSide: PositionSide,
  intent?: MarginIntent,
): Result<MarginOperation> {
  const op = marginOperation(side, positionSide);
  if (intent === undefined || intent === op.intent) return { success: true, data: op };
  const actual = OPERATIONS[positionSide][side];
  const wanted = OPERATIONS[positionSide][OPPOSITE[side]];
  return {
    success: false,
    error:
      `--intent=${intent} と注文の向きが食い違っています: ${side} × ${positionSide} は ` +
      `${actual.name}（${actual.intent}）です。${wanted.name}なら --side=${OPPOSITE[side]} を指定してください`,
    exitCode: EXIT.PARAM,
  };
}
