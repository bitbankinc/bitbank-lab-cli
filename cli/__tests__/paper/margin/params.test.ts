import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pairs } from "../../../commands/public/pairs.js";
import type { CachedPair } from "../../../pairs-cache.js";
import { marginParamsOf } from "../../../paper-margin/params.js";
import { MOCK_PAIRS } from "../../test-helpers.js";

const CURRENT_UNTIL = 1785250799999; // 2026-07-28 23:59:59.999 JST
const NEXT_UNTIL = 1785855599999; // 2026-08-04 23:59:59.999 JST

const btc: CachedPair = {
  ...MOCK_PAIRS[0],
  margin_open_maker_fee_rate_quote: 0,
  margin_open_taker_fee_rate_quote: 0.001,
  margin_close_maker_fee_rate_quote: -0.0002,
  margin_close_taker_fee_rate_quote: 0.0012,
  margin_long_interest: 0.0004,
  margin_short_interest: 0.0005,
  margin_current_individual_ratio: 0.5,
  margin_current_individual_until: CURRENT_UNTIL,
  margin_current_company_ratio: 0.0818,
  margin_current_company_until: CURRENT_UNTIL,
  margin_next_individual_ratio: 0.4,
  margin_next_individual_until: NEXT_UNTIL,
  margin_next_company_ratio: 0.0818,
  margin_next_company_until: NEXT_UNTIL,
  stop_margin_long_order: false,
  stop_margin_short_order: true,
};

describe("marginParamsOf", () => {
  it("maps the individual ratio, fees, interest and stop flags", () => {
    const r = marginParamsOf(btc, CURRENT_UNTIL - 1);
    expect(r).toEqual({
      kind: "ok",
      params: {
        pair: "btc_jpy",
        riskRatio: 0.5,
        riskRatioUntilMs: CURRENT_UNTIL,
        riskRatioSource: "current",
        fee: { openMaker: 0, openTaker: 0.001, closeMaker: -0.0002, closeTaker: 0.0012 },
        interestPerDay: { long: 0.0004, short: 0.0005 },
        stopNewLong: false,
        stopNewShort: true,
      },
    });
  });

  it("uses the current ratio up to and including its until", () => {
    const r = marginParamsOf(btc, CURRENT_UNTIL);
    expect(r.kind === "ok" && r.params.riskRatioSource).toBe("current");
  });

  it("switches to the next ratio after the current one expires", () => {
    const r = marginParamsOf(btc, CURRENT_UNTIL + 1);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.params.riskRatio).toBe(0.4);
      expect(r.params.riskRatioUntilMs).toBe(NEXT_UNTIL);
      expect(r.params.riskRatioSource).toBe("next");
    }
  });

  it("is stale once the next ratio has expired too", () => {
    expect(marginParamsOf(btc, NEXT_UNTIL + 1)).toEqual({ kind: "stale", pair: "btc_jpy" });
  });

  it("is stale after the current until when no next ratio is published", () => {
    const noNext = {
      ...btc,
      margin_next_individual_ratio: null,
      margin_next_individual_until: null,
    };
    expect(marginParamsOf(noNext, CURRENT_UNTIL + 1).kind).toBe("stale");
  });

  it("keeps using a ratio whose until is the far-future sentinel (sol / doge, no next)", () => {
    // 2026-11-24 の実 /spot/pairs: sol_jpy / doge_jpy は until = 9999-12-31T23:59:59.999Z、next は null
    const sol = {
      ...btc,
      name: "sol_jpy",
      margin_current_individual_until: 253402300799999,
      margin_next_individual_ratio: null,
      margin_next_individual_until: null,
    };
    const r = marginParamsOf(sol, Date.parse("2030-01-01T00:00:00Z"));
    expect(r.kind === "ok" && r.params.riskRatioUntilMs).toBe(253402300799999);
  });

  it("treats a null risk ratio as a non-margin pair", () => {
    const ltc = { ...MOCK_PAIRS[0], name: "ltc_jpy", margin_current_individual_ratio: null };
    expect(marginParamsOf(ltc, 0)).toEqual({ kind: "unsupported", pair: "ltc_jpy" });
  });

  it("is unknown (not unsupported) when the pairs data carries no margin fields at all", () => {
    const r = marginParamsOf(MOCK_PAIRS[0], 0);
    expect(r.kind).toBe("unknown");
  });

  it("is unknown when a margin pair has a missing fee or stop flag", () => {
    const r = marginParamsOf({ ...btc, margin_close_taker_fee_rate_quote: null }, 0);
    expect(r.kind).toBe("unknown");
    if (r.kind === "unknown") expect(r.reason).toContain("margin_close_taker_fee_rate_quote");
    const { stop_margin_short_order: _, ...noStop } = btc;
    expect(marginParamsOf(noStop, 0).kind).toBe("unknown");
  });

  it.each([
    ["zero ratio", { margin_current_individual_ratio: 0 }],
    ["ratio above 1", { margin_current_individual_ratio: 1.5 }],
    ["next ratio out of range", { margin_next_individual_ratio: -0.1 }],
    ["negative interest", { margin_long_interest: -0.0001 }],
    ["fee rate as percent", { margin_open_taker_fee_rate_quote: 1.2 }],
  ])("is unknown on an unexpected value (%s)", (_label, override) => {
    expect(marginParamsOf({ ...btc, ...override }, 0).kind).toBe("unknown");
  });
});

describe("marginParamsOf on the real /spot/pairs fixture", () => {
  it("returns ok for exactly the 5 margin pairs and unsupported for the rest", async () => {
    const raw = JSON.parse(
      readFileSync(new URL("../../__fixtures__/tax/pairs-master.json", import.meta.url), "utf-8"),
    ) as { fetched_at_utc: string; pairs: unknown[] };
    const parsed = await pairs({
      fetch: async () => new Response(JSON.stringify({ success: 1, data: { pairs: raw.pairs } })),
      retries: 0,
    });
    if (!parsed.success) throw new Error(parsed.error);
    const fetchedAt = Date.parse("2026-07-25T11:20:02Z");
    const kinds = parsed.data.map((p) => [p.name, marginParamsOf(p, fetchedAt).kind] as const);
    const ok = kinds
      .filter(([, k]) => k === "ok")
      .map(([n]) => n)
      .sort();
    expect(ok).toEqual(["btc_jpy", "doge_jpy", "eth_jpy", "sol_jpy", "xrp_jpy"]);
    expect(kinds.every(([, k]) => k === "ok" || k === "unsupported")).toBe(true);
  });
});
