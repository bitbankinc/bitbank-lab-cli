// 正規化イベント（v2 §13.2）。API / UI CSV / 手動調整のすべてがこの型に落ちる。
// 条件付き必須（取得系は costbasis_provenance が要る等）は**コメントではなく
// superRefine で強制**する。型は z.infer が単一ソース（CLAUDE.md）。
import { z } from "zod";
import {
  ACQUIRE_KINDS,
  EventKind,
  Fee,
  Margin,
  RateSource,
  TRADE_KINDS,
  Transfer,
} from "./event-parts.js";
import {
  CostbasisProvenance,
  decStr,
  EventFlag,
  MarketType,
  RecognitionPolicy,
  SourceSystem,
} from "./primitives.js";

export { ACQUIRE_KINDS, EventKind, TRADE_KINDS } from "./event-parts.js";

const TaxEventBase = z.object({
  event_id: z.string(), // `<prefix>:<source_ref>` で決定論的に生成（冪等性 NFR）
  source_ref: z.string(), // trade_id / 販売所注文ID / uuid（監査・重複排除）
  ts_utc: z.number().int(),
  ts_jst: z.string(), // jstIso() の +09:00 付き ISO
  year_jst: z.number().int(), // jstYear()。年分判定はこれだけを使う（ADR-004）
  account_id: z.string(),
  kind: EventKind,
  market_type: MarketType.optional(),
  source_system: SourceSystem,
  currency: z.string(), // 名寄せ後の資産キー（matic→pol, rndr→render のみ）
  qty: decStr,
  jpy_value: decStr.optional(),
  rate_source: RateSource.optional(),
  transfer: Transfer.optional(),
  margin: Margin.optional(),
  fee: Fee.optional(),
  costbasis_provenance: CostbasisProvenance.optional(),
  recognition_policy: RecognitionPolicy,
  flags: z.array(EventFlag),
  pair_raw: z.string().optional(), // 付録E.5: ペア名は生値保持（名寄せしない）
});

export const TaxEvent = TaxEventBase.superRefine((e, ctx) => {
  const need = (ok: boolean, path: string, message: string) => {
    if (!ok) ctx.addIssue({ code: "custom", path: [path], message });
  };
  need(
    !ACQUIRE_KINDS.includes(e.kind) || e.costbasis_provenance !== undefined,
    "costbasis_provenance",
    `${e.kind} は取得系イベントなので costbasis_provenance が必須`,
  );
  need(
    !TRADE_KINDS.includes(e.kind) || e.market_type !== undefined,
    "market_type",
    `${e.kind} は約定なので market_type（ORDERBOOK / BROKERAGE）が必須`,
  );
  // 販売所は API にも「約定履歴 CSV」にも現れない（付録E.3 訂正）。取込元が
  // 「売買履歴 CSV」か手入力でなければ、取込経路を取り違えている
  need(
    e.market_type !== "BROKERAGE" ||
      e.source_system === "UI_CSV_BROKERAGE" ||
      e.source_system === "MANUAL",
    "source_system",
    "BROKERAGE の取込元は UI_CSV_BROKERAGE か MANUAL のみ（API / 約定履歴CSV には現れない）",
  );
  // 販売所は手数料列を持たない（スプレッド内包）。fee=0 との混同を型で防ぐ
  need(
    e.market_type !== "BROKERAGE" || e.fee === undefined,
    "fee",
    "BROKERAGE は手数料列を持たない（BROKERAGE_SPREAD フラグで表現する）",
  );
  need(
    (e.kind !== "MARGIN_OPEN" && e.kind !== "MARGIN_CLOSE") || e.margin !== undefined,
    "margin",
    `${e.kind} は margin が必須`,
  );
});
export type TaxEvent = z.infer<typeof TaxEvent>;
