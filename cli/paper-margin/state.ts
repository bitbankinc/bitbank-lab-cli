// paper の信用の state スキーマ（ADR-010 / docs/dev/paper-margin-plan.md §3.3・§3.8）。
// PaperState v4 の `margin`（cli/paper-state.ts）。信用の注文・約定履歴は現物の openOrders / history とは
// 別の配列に持つ。現物のコード（computeLocked・paper-fill・computePositions）が信用の注文や売りを
// 現物として扱わないようにするため。JPY 残高は現物と共有する balances.jpy（差入保証金）。
//
// フィールド名は paper の state の慣例どおり camelCase にし、本番 margin-positions の名前
// （open_amount / product / average_price / unrealized_fee_amount / unrealized_interest_amount）
// への写像は出力側で行う。locked_amount（未約定の返済注文が予約している数量）は state に
// 持たず、openOrders から導く（closable.ts）。取消・約定のたびに数字を合わせ直さずに済む。
import { z } from "zod";
import { PositionSideSchema } from "../margin-operation.js";
import { defaultMarginAssumptions, MarginAssumptionsSchema } from "./assumptions.js";
import { MarginHistoryEntrySchema } from "./history.js";
import { MarginPairParamsSchema } from "./params.js";

export const MarginPositionSchema = z.object({
  pair: z.string(),
  positionSide: PositionSideSchema,
  /** 建玉数量（本番の open_amount） */
  openAmount: z.number().positive(),
  /** Σ 約定数量 × 約定価格（本番の product）。平均建値 = product / openAmount */
  product: z.number().positive(),
  /** 新規建て時に積んだ手数料のうち未精算分（本番の unrealized_fee_amount）。リベートなら負 */
  unrealizedFee: z.number(),
  /** 積み上がった利息のうち未精算分（本番の unrealized_interest_amount） */
  unrealizedInterest: z.number().nonnegative(),
  /** 最初に建てた時刻（ISO 8601） */
  openedAt: z.string(),
  /** 利息を最後に積んだ時刻（ISO 8601）。利息は JST 0 時をまたぐたびに積む（ADR-010 決定 7） */
  lastInterestAt: z.string(),
});

export type MarginPosition = z.infer<typeof MarginPositionSchema>;

/** 未約定の信用の指値（新規建て・返済）。paper の指値は GTC で部分約定しない */
export const MarginOrderSchema = z.object({
  id: z.string(),
  pair: z.string(),
  side: z.enum(["buy", "sell"]),
  positionSide: PositionSideSchema,
  type: z.literal("limit"),
  price: z.number().positive(),
  amount: z.number().positive(),
  createdAt: z.string(),
});

/** 発生中の追証（信用取引ルール: 毎日 15 時に判定、基準時から 24 時間以内に解消） */
export const MarginCallSchema = z.object({
  /** 基準時（JST 15 時。ISO 8601） */
  judgedAt: z.string(),
  /** 解消期限（基準時 + 24 時間。ISO 8601） */
  deadline: z.string(),
  /** 追証額 = 維持必要保証金額 − 受入保証金合計額（基準時点） */
  amount: z.number().positive(),
});

export const MarginStateSchema = z.object({
  positions: z.array(MarginPositionSchema),
  orders: z.array(MarginOrderSchema),
  call: MarginCallSchema.nullable(),
  history: z.array(MarginHistoryEntrySchema),
  assumptions: MarginAssumptionsSchema,
  /** 信用の走査を済ませた時刻（ISO 8601）。現物の lastTickAt とは別に進める（book.ts の marginScannedAtMs）。
   *  現物の足の取得に失敗しても信用の走査は進められ、同じ区間を 2 度走査しないようにするため。
   *  無ければ lastTickAt から（この欄が入る前に書かれた v4 の state） */
  lastScanAt: z.string().optional(),
  /** ペアごとに最後に読めた信用パラメータ（paper-margin-pairs.ts）。pairs から読めなくなったペアの建玉を
   *  評価・返済し続けるための控え（信用の取扱終了・フィールド欠落など）。使ったときは出力で申告する */
  lastParams: z.record(z.string(), MarginPairParamsSchema).optional(),
  /** まだ追証の解消の判定に使っていない現物の売りの約定時刻（ISO 8601）。信用の走査が失敗した tick や、
   *  信用の走査済み時刻より前の約定がその後で確定した tick の分。次に走査できた tick が判定して空にする */
  pendingSpotSales: z.array(z.string()).optional(),
});

export type MarginOrder = z.infer<typeof MarginOrderSchema>;
export type MarginCall = z.infer<typeof MarginCallSchema>;
export type MarginState = z.infer<typeof MarginStateSchema>;

/** 建玉も注文も無い信用の状態。仮定値は fixedAt の時点の既定で固定する */
export function emptyMarginState(fixedAt: string): MarginState {
  return {
    positions: [],
    orders: [],
    call: null,
    history: [],
    assumptions: defaultMarginAssumptions(fixedAt),
  };
}

/** 信用の判定に要る口座の状態。jpy は現物と共有する JPY 残高（差入保証金。負なら不足金） */
export type MarginBook = {
  jpy: number;
  positions: MarginPosition[];
  orders: MarginOrder[];
  call: MarginCall | null;
};
