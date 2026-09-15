// 100行超: 取得〜3 行整形の通し検証。「確定足だけで指標を計算する」「JST 当日の出来高」
// 「失敗銘柄を落とさず partial で申告する」を 1 本の実行経路で押さえる。
import { describe, expect, it, vi } from "vitest";
import { runBrief } from "../../brief/run.js";
import { BriefSchema } from "../../brief/schema.js";
import { dailyCandles, hourlyCandles, mockMarketFetch } from "./mock-candles.js";

const DAY = 86_400_000;
// 2026-08-02（日）01:30 UTC = 10:30 JST。当日の日足（UTC 08-02）は未確定。
const NOW = Date.parse("2026-08-02T01:30:00Z");
const TODAY_UTC = Date.UTC(2026, 7, 2);
const OPTS = { retries: 0 } as const;

function market(pairs: string[]) {
  const daily: Record<string, ReturnType<typeof dailyCandles>> = {};
  const hourly: Record<string, ReturnType<typeof hourlyCandles>> = {};
  for (const p of pairs) {
    daily[p] = dailyCandles(TODAY_UTC, 250);
    // UTC 08-01 00:00 〜 08-02 01:00 の 26 本。JST 08-02 は UTC 08-01 15:00 以降 = 11 本
    hourly[p] = hourlyCandles(TODAY_UTC - DAY, 26, 2);
  }
  return { daily, hourly };
}

describe("runBrief", () => {
  it("computes indicators on confirmed candles only and renders 3 lines per pair", async () => {
    const { fetch, urls } = mockMarketFetch(market(["btc_jpy"]));
    const r = await runBrief(
      { pairs: ["btc_jpy"], nowMs: NOW, concurrency: 4, noCache: true },
      { ...OPTS, fetch },
    );
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(BriefSchema.safeParse(r.data).success).toBe(true);
    expect(r.partial).toBeUndefined();
    const b = r.data.pairs[0];
    expect(b.daily_incomplete).toBe(true);
    // 確定足 249 本 → SMA200 まで揃い、緩やかな上昇なので全 SMA の上 = UP
    expect(b.sma200).not.toBeNull();
    expect(b.trend).toBe("UP");
    expect(b.position).toEqual([">S20", ">S50", ">S200"]);
    expect(b.rsi14).toBe(100);
    expect(b.macd_sign).toBe("+");
    // 直近確定日は UTC 08-01（土）
    expect(b.last_confirmed?.date).toBe("2026-08-01");
    expect(b.last_confirmed?.weekday).toBe("Sat");
    // JST 08-02 に属する時足は 11 本 × vol 2
    expect(b.volume.today_jst).toBe(22);
    expect(b.volume.sample_days).toBe(30);
    expect(b.lines).toHaveLength(3);
    expect(b.lines[0]).toMatch(/^## btc_jpy {2}px=/);
    expect(b.lines[0]).toContain("※日足未確定");
    expect(r.data.text.split("\n")[0]).toBe(
      "# bitbank periodical brief 2026-08-02 Sun JST 10:30  (1 pairs)",
    );
    expect(r.data.as_of).toBe("2026-08-02T01:30:00.000Z");
    // 1 銘柄 4 リクエスト: 1day/2025, 1day/2026, 1hour/20260801, 1hour/20260802
    expect(urls.map((u) => u.split("/candlestick/")[1]).sort()).toEqual([
      "1day/2025",
      "1day/2026",
      "1hour/20260801",
      "1hour/20260802",
    ]);
  });

  it("treats the last candle as confirmed when it is not today's", async () => {
    const m = market(["btc_jpy"]);
    m.daily.btc_jpy = dailyCandles(TODAY_UTC - DAY, 40);
    const { fetch } = mockMarketFetch(m);
    const r = await runBrief(
      { pairs: ["btc_jpy"], nowMs: NOW, concurrency: 4, noCache: true },
      { ...OPTS, fetch },
    );
    expect(r.success && r.data.pairs[0].daily_incomplete).toBe(false);
    expect(r.success && r.data.pairs[0].sma200).toBeNull();
    expect(r.success && r.data.pairs[0].lines[0]).not.toContain("未確定");
  });

  it("reports MIX (not UP) when no SMA can be computed", async () => {
    const m = market(["btc_jpy"]);
    m.daily.btc_jpy = dailyCandles(TODAY_UTC, 10);
    const { fetch } = mockMarketFetch(m);
    const r = await runBrief(
      { pairs: ["btc_jpy"], nowMs: NOW, concurrency: 1, noCache: true },
      { ...OPTS, fetch },
    );
    expect(r.success && r.data.pairs[0].position).toEqual([]);
    expect(r.success && r.data.pairs[0].trend).toBe("MIX");
    expect(r.success && r.data.pairs[0].lines[0]).toContain("trend:MIX[]");
  });

  it("keeps successful pairs and reports failed ones as partial", async () => {
    const m = { ...market(["btc_jpy", "eth_jpy"]), fail: { "eth_jpy/candlestick/1hour": 500 } };
    const { fetch } = mockMarketFetch(m);
    const r = await runBrief(
      { pairs: ["btc_jpy", "eth_jpy"], nowMs: NOW, concurrency: 1, noCache: true },
      { ...OPTS, fetch },
    );
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.partial).toBe(true);
    expect(r.data.pairs.map((p) => p.pair)).toEqual(["btc_jpy"]);
    expect(r.data.errors).toHaveLength(1);
    expect(r.data.errors[0].pair).toBe("eth_jpy");
    expect(r.data.text).toContain("## eth_jpy  ERROR:");
  });

  it("converts an exception inside one pair into a per-pair error (no global reject)", async () => {
    const fetchMod = await import("../../brief/fetch.js");
    const spy = vi.spyOn(fetchMod, "fetchHourly").mockImplementation(async (pair) => {
      if (pair === "eth_jpy") throw new Error("EACCES: mkdir failed");
      return { success: true, data: hourlyCandles(TODAY_UTC - DAY, 26, 2) };
    });
    try {
      const { fetch } = mockMarketFetch(market(["btc_jpy", "eth_jpy"]));
      const r = await runBrief(
        { pairs: ["btc_jpy", "eth_jpy"], nowMs: NOW, concurrency: 2, noCache: true },
        { ...OPTS, fetch },
      );
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.partial).toBe(true);
      expect(r.data.pairs.map((p) => p.pair)).toEqual(["btc_jpy"]);
      expect(r.data.errors[0]).toMatchObject({ pair: "eth_jpy" });
      expect(r.data.errors[0].error).toContain("EACCES");
    } finally {
      spy.mockRestore();
    }
  });

  it("fails outright when every pair fails", async () => {
    const { fetch } = mockMarketFetch({ daily: {}, hourly: {} });
    const r = await runBrief(
      { pairs: ["btc_jpy"], nowMs: NOW, concurrency: 1, noCache: true },
      { ...OPTS, fetch },
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("btc_jpy");
  });

  it("preserves input order regardless of concurrency", async () => {
    const pairs = ["xrp_jpy", "btc_jpy", "eth_jpy"];
    const { fetch } = mockMarketFetch(market(pairs));
    const r = await runBrief(
      { pairs, nowMs: NOW, concurrency: 2, noCache: true },
      { ...OPTS, fetch },
    );
    expect(r.success && r.data.pairs.map((p) => p.pair)).toEqual(pairs);
  });
});

describe("volume profile", () => {
  it("splits the 30-day sample by JST weekday", async () => {
    const m = market(["btc_jpy"]);
    // 曜日で出来高を変える: 平日 10、土 4、日 3（timestamp は UTC 00:00 = JST 09:00 同日）
    m.daily.btc_jpy = m.daily.btc_jpy.map((c) => {
      const w = (new Date(c.timestamp).getUTCDay() + 6) % 7;
      return { ...c, vol: w < 5 ? 10 : w === 5 ? 4 : 3 };
    });
    const { fetch } = mockMarketFetch(m);
    const r = await runBrief(
      { pairs: ["btc_jpy"], nowMs: NOW, concurrency: 1, noCache: true },
      { ...OPTS, fetch },
    );
    expect(r.success).toBe(true);
    if (!r.success) return;
    const v = r.data.pairs[0].volume;
    expect(v.weekday_avg).toBe(10);
    expect(v.sat_avg).toBe(4);
    expect(v.sun_avg).toBe(3);
    expect(v.sat_vs_weekday_pct).toBe(40);
    expect(r.data.pairs[0].lines[1]).toContain("sat=4.0(40%)");
  });
});
