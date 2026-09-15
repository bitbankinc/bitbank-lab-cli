// periodical-brief の params / output（agents カタログの単一ソース）。
// 出力は 3 行テキスト（lines / text）と、その元になった数値・前提（note）を両方持つ。
import { WEEKDAYS } from "../../brief/jst.js";
import { TRENDS } from "../../brief/schema.js";
import { p, type SchemaDef } from "./types.js";

const n = { type: "number" };
const nn = { type: ["number", "null"] };
const s = { type: "string" };
const b = { type: "boolean" };

const pairBrief = {
  type: "object",
  properties: {
    pair: s,
    price: n,
    intraday_pct: n,
    daily_incomplete: b,
    rsi14: nn,
    macd_hist: nn,
    macd_sign: { type: ["string", "null"], enum: ["+", "-", null] },
    sma20: nn,
    sma50: nn,
    sma200: nn,
    trend: { type: "string", enum: [...TRENDS] },
    position: { type: "array", items: s },
    volume: {
      type: "object",
      properties: {
        today_jst: n,
        weekday_avg: nn,
        sat_avg: nn,
        sun_avg: nn,
        sat_vs_weekday_pct: nn,
        avg_30d: n,
        sample_days: n,
      },
    },
    last_confirmed: {
      type: ["object", "null"],
      properties: {
        date: s,
        weekday: { type: "string", enum: [...WEEKDAYS] },
        open: n,
        close: n,
        change_pct: n,
      },
    },
    atr14: nn,
    lines: { type: "array", items: s, minItems: 3, maxItems: 3 },
  },
};

export const publicBriefSchemas: Record<string, SchemaDef> = {
  "periodical-brief": {
    category: "public",
    params: {
      pairs: p(
        "string",
        "Pairs as bare arguments (e.g. `periodical-brief btc_jpy eth_jpy`) or comma-separated via --pairs. " +
          "Default: btc_jpy eth_jpy xrp_jpy",
        { positional: true },
      ),
      top: p("number", "Auto-select the top N tradable JPY pairs by 24h turnover (vol × last)"),
      all: p("boolean", "All tradable JPY pairs, sorted by 24h turnover"),
      concurrency: p("number", "Max pairs processed in parallel (default 16, max 64)", {
        default: 16,
      }),
      "no-cache": p("boolean", "Bypass the local candle cache"),
    },
    output: {
      type: "object",
      properties: {
        as_of: s,
        as_of_jst: s,
        pairs: { type: "array", items: pairBrief },
        errors: {
          type: "array",
          items: { type: "object", properties: { pair: s, error: s } },
        },
        text: s,
        note: s,
      },
    },
  },
};
