import { describe, expect, it } from "vitest";
import { DEFAULT_PAIRS, periodicalBrief } from "../../commands/public/periodical-brief.js";
import { EXIT } from "../../exit-codes.js";
import { dailyCandles, hourlyCandles, mockMarketFetch } from "../brief/mock-candles.js";

const DAY = 86_400_000;
const OPTS = { retries: 0 } as const;

function marketFor(pairs: string[], tickers?: unknown) {
  const today = Date.now() - (Date.now() % DAY);
  const daily: Record<string, ReturnType<typeof dailyCandles>> = {};
  const hourly: Record<string, ReturnType<typeof hourlyCandles>> = {};
  for (const p of pairs) {
    daily[p] = dailyCandles(today, 60);
    hourly[p] = hourlyCandles(today - DAY, 30);
  }
  return mockMarketFetch({ daily, hourly, tickers });
}

describe("periodicalBrief params", () => {
  it.each([
    ["bad --top", { top: "abc" }, "--top must be a positive integer"],
    ["zero --top", { top: "0" }, "--top must be a positive integer"],
    ["bad --concurrency", { concurrency: "0" }, "--concurrency must be a positive integer"],
    ["too large --concurrency", { concurrency: "65" }, "--concurrency must be <= 64"],
    ["bad pair", { pairs: ["BTC/JPY"] }, "pair must be like btc_jpy"],
    ["--top with pairs", { top: "3", pairs: ["btc_jpy"] }, "mutually exclusive"],
    ["--top with --all", { top: "3", all: true }, "mutually exclusive"],
  ])("rejects %s with EXIT.PARAM", async (_label, args, msg) => {
    const r = await periodicalBrief(args, OPTS);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.exitCode).toBe(EXIT.PARAM);
    expect(r.error).toContain(msg);
  });
});

describe("periodicalBrief pair selection", () => {
  it("uses the default trio when no pairs are given", async () => {
    const { fetch, urls } = marketFor(DEFAULT_PAIRS);
    const r = await periodicalBrief({}, { ...OPTS, fetch });
    expect(r.success && r.data.pairs.map((p) => p.pair)).toEqual(DEFAULT_PAIRS);
    expect(urls.some((u) => u.endsWith("/tickers"))).toBe(false);
  });

  it("dedupes explicit pairs", async () => {
    const { fetch } = marketFor(["btc_jpy"]);
    const r = await periodicalBrief({ pairs: ["btc_jpy", "btc_jpy"] }, { ...OPTS, fetch });
    expect(r.success && r.data.pairs).toHaveLength(1);
  });

  it("--top ranks tradable JPY pairs by turnover and drops legacy / non-JPY tickers", async () => {
    const t = (pair: string, vol: string, last: string) => ({
      pair,
      sell: last,
      buy: last,
      high: last,
      low: last,
      open: last,
      last,
      vol,
      timestamp: 1,
    });
    const tickers = [
      t("eth_jpy", "100", "500000"), // 5e7
      t("btc_jpy", "10", "10000000"), // 1e8
      t("matic_jpy", "1000000", "1000"), // legacy: 1e9 but excluded
      t("eth_btc", "1000000", "1"), // non-JPY: excluded
      t("xrp_jpy", "1000", "300"), // 3e5
    ];
    const { fetch } = marketFor(["btc_jpy", "eth_jpy", "xrp_jpy"], tickers);
    const top2 = await periodicalBrief({ top: "2" }, { ...OPTS, fetch });
    expect(top2.success && top2.data.pairs.map((p) => p.pair)).toEqual(["btc_jpy", "eth_jpy"]);
    const all = await periodicalBrief({ all: true }, { ...OPTS, fetch });
    expect(all.success && all.data.pairs.map((p) => p.pair)).toEqual([
      "btc_jpy",
      "eth_jpy",
      "xrp_jpy",
    ]);
  });

  it("fails when tickers yield no tradable pair", async () => {
    const { fetch } = marketFor([], [{ pair: "eth_btc", vol: "1", last: "1", timestamp: 1 }]);
    const r = await periodicalBrief({ all: true }, { ...OPTS, fetch });
    expect(r.success).toBe(false);
  });
});
