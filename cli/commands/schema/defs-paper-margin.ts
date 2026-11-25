// 100行超: paper の信用コマンドの params / output（agents カタログの単一ソース）を宣言的に集約。
// 信用の state（建玉・注文・約定履歴）のフィールドを 1 つずつ列挙するため出力項目数に比例して伸びる（defs-paper.ts と同じ）。
//
// paper の信用（ADR-010）の出力スキーマ。
// 欄は cli/paper-margin/ の型（history.ts の MarginHistoryEntry、tick-report.ts の MarginTickReport）に合わせる。
// 信用のコマンド（create-margin-order / margin-status / margin-positions）の定義もここに置く。
import { p, type SchemaDef } from "./types.js";

const s = { type: "string" };
const n = { type: "number" };
const b = { type: "boolean" };

/** 信用の約定履歴の 1 行（本番 trade-history の信用行と同じ手数料・損益の欄） */
export const marginHistoryEntry = {
  type: "object",
  properties: {
    id: s,
    pair: s,
    side: s,
    positionSide: s,
    type: { type: "string", enum: ["market", "limit", "losscut"] },
    amount: n,
    fillPrice: n,
    feeOccurred: n,
    feeCharged: n,
    profitLoss: n,
    interest: n,
    filledAt: s,
  },
};

/** lazy tick で信用の走査を回したときの結果（paper tick の output.margin） */
export const marginTickReport = {
  type: "object",
  description:
    "Present only when the account has margin positions or orders. Fills and losscut closes, plus margin-call / losscut events",
  properties: {
    filled: { type: "array", items: marginHistoryEntry },
    events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["margin-call", "margin-call-resolved", "losscut"] },
          at: s,
          deadline: s,
          amount: n,
          reason: { type: "string", enum: ["below-losscut", "margin-call-expired"] },
          canceled: {
            type: "array",
            items: s,
            description: "losscut only: ids of the margin orders canceled by the losscut",
          },
        },
      },
    },
    approximate: b,
  },
};

/** paper pnl の margin 欄（信用の建玉・約定があるときだけ。現物の perPair / total とは別） */
export const marginPnl = {
  type: "object",
  description:
    "Present only with margin positions or fills. Rows per pair × position side; realizedPnl is net of fees and interest, " +
    "unrealizedPnl is the price move minus unsettled fees and interest",
  properties: {
    perPosition: {
      type: "array",
      items: {
        type: "object",
        properties: {
          pair: s,
          positionSide: s,
          position: n,
          avgCost: n,
          currentPrice: n,
          realizedPnl: n,
          unrealizedPnl: n,
          totalPnl: n,
        },
      },
    },
    total: { type: "object", properties: { realizedPnl: n, unrealizedPnl: n, totalPnl: n } },
  },
};

const marginOrder = {
  type: "object",
  properties: {
    id: s,
    pair: s,
    side: s,
    positionSide: s,
    type: s,
    price: n,
    amount: n,
    createdAt: s,
  },
};

const marginPosition = {
  type: ["object", "null"],
  properties: {
    pair: s,
    positionSide: s,
    openAmount: n,
    product: n,
    unrealizedFee: n,
    unrealizedInterest: n,
    openedAt: s,
    lastInterestAt: s,
  },
};

const nn = { type: ["number", "null"] };
const assumptions = {
  type: "object",
  description:
    "Values the paper margin cannot read from the public API: published-rule constants fixed at init, " +
    "the valuation price assumption (ticker last) and collateral scope (JPY only), with the source",
};

const operation = {
  type: "object",
  description: "Derived from side × position_side (e.g. ロング返済（sell × long）)",
  properties: { label: s, intent: { type: "string", enum: ["open", "close"] } },
};

export const paperMarginSchemas: Record<string, SchemaDef> = {
  "create-margin-order": {
    category: "paper",
    params: {
      pair: p("string", "Margin-enabled trading pair (e.g. btc_jpy)"),
      side: p("string", "Order side. Open/close is decided by side × position-side", {
        enum: ["buy", "sell"],
      }),
      "position-side": p(
        "string",
        "Position side (required): buy×long / sell×short open, sell×long / buy×short close",
        {
          enum: ["long", "short"],
        },
      ),
      type: p("string", "Order type", { enum: ["market", "limit"] }),
      amount: p("string", "Order amount"),
      price: p("string", "Limit price (required for limit orders)"),
      intent: p(
        "string",
        "Optional cross-check; rejected with PARAM if it does not match side × position-side",
        {
          enum: ["open", "close"],
        },
      ),
    },
    // market は ticker の last で即時約定、limit は margin.orders に積むだけ（約定は lazy tick）
    output: {
      oneOf: [
        {
          type: "object",
          required: ["operation", "fill"],
          properties: {
            operation,
            fill: marginHistoryEntry,
            position: marginPosition,
            jpy: n,
            marginCallResolved: b,
          },
        },
        {
          type: "object",
          required: ["operation", "placed"],
          properties: { operation, placed: marginOrder },
        },
      ],
    },
  },
  "margin-status": {
    category: "paper",
    params: {},
    // 本番 margin-status と同名の欄は同じ意味・同じ丸め。margin_call_percentage / losscut_percentage は出さず thresholds を出す
    output: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["NORMAL", "CALL", "DEBT"] },
        total_margin_balance: n,
        total_margin_balance_percentage: nn,
        margin_position_profit_loss: n,
        unrealized_cost: n,
        total_margin_position_product: n,
        open_margin_position_product: n,
        open_margin_order_product: n,
        total_position_maintenance_margin: n,
        total_long_position_maintenance_margin: n,
        total_short_position_maintenance_margin: n,
        total_open_order_maintenance_margin: n,
        total_long_open_order_maintenance_margin: n,
        total_short_open_order_maintenance_margin: n,
        available_balances: {
          type: "array",
          description:
            "Paper estimate (B − Mm − Mo) / risk ratio; production is also capped by the credit line",
          items: { type: "object", properties: { pair: s, long: n, short: n } },
        },
        thresholds: {
          type: "object",
          description:
            "Paper's trigger levels in margin ratio %: margin call below Mm / P, losscut below Mm × multiplier / P",
          properties: { margin_call_below_percentage: nn, losscut_below_percentage: nn },
        },
        margin_call: {
          type: ["object", "null"],
          properties: { judgedAt: s, deadline: s, amount: n },
        },
        payables: { type: "object", properties: { amount: n } },
        last_scan_at: s,
        stale: {
          type: "boolean",
          description: "True if the last tick could not process margin up to now",
        },
        assumptions,
      },
    },
  },
  "margin-positions": {
    category: "paper",
    params: {
      pair: p(
        "string",
        "Show positions of this pair only (filtered after loading, like production)",
      ),
    },
    output: {
      type: "object",
      properties: {
        notice: {
          type: ["object", "null"],
          properties: {
            what: { type: "string", enum: ["margin_call", "debt"] },
            occurred_at: nn,
            amount: n,
            due_date_at: nn,
          },
        },
        payables: { type: "object", properties: { amount: n } },
        positions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              pair: s,
              position_side: s,
              open_amount: n,
              locked_amount: n,
              product: n,
              average_price: n,
              unrealized_fee_amount: n,
              unrealized_interest_amount: n,
              opened_at: s,
              current_price: nn,
              unrealized_profit_loss: nn,
            },
          },
        },
        last_scan_at: s,
        stale: b,
        assumptions,
      },
    },
  },
};
