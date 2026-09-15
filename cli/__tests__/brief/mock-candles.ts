// periodical-brief テスト用の URL ディスパッチ mock fetch。
// `/{pair}/candlestick/1day/{YYYY}` と `/{pair}/candlestick/1hour/{YYYYMMDD}` を
// 決定的な合成データで返す。
import type { Candle } from "../../commands/public/candles-fetch.js";

const DAY = 86_400_000;
const HOUR = 3_600_000;

export type Row = [string, string, string, string, string, number];

function row(c: Candle): Row {
  return [
    String(c.open),
    String(c.high),
    String(c.low),
    String(c.close),
    String(c.vol),
    c.timestamp,
  ];
}

/** endMs（UTC 00:00）までの days 本の日足。価格は base から 1 日 +0.5% の緩やかな上昇 */
export function dailyCandles(endMs: number, days: number, base = 1_000_000): Candle[] {
  const out: Candle[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const ts = endMs - i * DAY;
    const open = base * 1.005 ** (days - 1 - i);
    const close = open * 1.005;
    out.push({
      open,
      high: close * 1.01,
      low: open * 0.99,
      close,
      vol: 100 + (i % 7),
      timestamp: ts,
    });
  }
  return out;
}

export function hourlyCandles(startMs: number, hours: number, vol = 1): Candle[] {
  return Array.from({ length: hours }, (_, i) => ({
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    vol,
    timestamp: startMs + i * HOUR,
  }));
}

export type MockMarket = {
  daily: Record<string, Candle[]>;
  hourly: Record<string, Candle[]>;
  tickers?: unknown;
  /** URL 部分文字列 → HTTP status。エラー応答の注入用 */
  fail?: Record<string, number>;
};

function envelope(type: string, rows: Candle[]): Response {
  return new Response(
    JSON.stringify({ success: 1, data: { candlestick: [{ type, ohlcv: rows.map(row) }] } }),
  );
}

/** 年間ファイルは UTC 年で、日次ファイルは UTC 日付で候補を絞る */
export function mockMarketFetch(m: MockMarket): { fetch: typeof globalThis.fetch; urls: string[] } {
  const urls: string[] = [];
  const fetch: typeof globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    urls.push(url);
    for (const [needle, status] of Object.entries(m.fail ?? {})) {
      if (url.includes(needle)) return new Response("{}", { status, statusText: "Injected" });
    }
    if (url.endsWith("/tickers")) {
      return new Response(JSON.stringify({ success: 1, data: m.tickers ?? [] }));
    }
    const mm = url.match(/\/([a-z0-9_]+)\/candlestick\/(1day|1hour)\/(\d+)$/);
    if (!mm) return new Response("{}", { status: 404, statusText: "Not Found" });
    const [, pair, type, key] = mm;
    if (type === "1day") {
      const rows = (m.daily[pair] ?? []).filter(
        (c) => new Date(c.timestamp).toISOString().slice(0, 4) === key,
      );
      return envelope(type, rows);
    }
    const rows = (m.hourly[pair] ?? []).filter(
      (c) => new Date(c.timestamp).toISOString().slice(0, 10).replace(/-/g, "") === key,
    );
    return envelope(type, rows);
  };
  return { fetch, urls };
}
