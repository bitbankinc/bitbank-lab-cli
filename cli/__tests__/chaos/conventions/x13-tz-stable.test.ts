import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { isCompletePeriod } from "../../../cache.js";
import { todayDate, ymdUtc, yearUtc } from "../../../date-utils.js";

// bitbank API は UTC 基準で日付境界を扱う（公式 docs は timezone 未記載だが実 API で確認済み:
// /candlestick/1hour/20260101 は UTC 2026-01-01 00:00〜23:00）。
// CLI 内の日付フォーマッタはホスト TZ に依存してはならない。
// 回帰例: JST ホストで 06:00 JST（= 前日 21:00 UTC）に paper tick を回すと、UTC 前日の
// はずの 1min candle を JST 当日（UTC 翌日）の日付で fetch して空配列が返り、指値が
// 静かに約定しない。

// 2026-01-01T22:00:00Z = JST 翌日 07:00（UTC では「同日」、JST では「翌日」）
const REGRESSION_MS = Date.parse("2026-01-01T22:00:00Z");

// 実 API 観測値: GET /btc_jpy/candlestick/1hour/20260101 の先頭 timestamp
// = 1767225600000 = 2026-01-01T00:00:00Z → UTC date "20260101"
const REAL_API_JAN1_UTC = 1767225600000;

function runUnderTz(tz: string, code: string): string {
  return execSync(`npx tsx -e ${JSON.stringify(code)}`, {
    encoding: "utf-8",
    env: { ...process.env, TZ: tz },
  });
}

describe("Chaos X-13: date utilities are TZ-stable (UTC 固定)", () => {
  it("ymdUtc returns the UTC date even when host is JST", () => {
    // 22:00 UTC は UTC 上ではまだ 01-01。JST では 01-02。
    expect(ymdUtc(REGRESSION_MS)).toBe("20260101");
    // UTC 境界の前後を確認
    expect(ymdUtc(Date.parse("2026-01-01T23:59:59Z"))).toBe("20260101");
    expect(ymdUtc(Date.parse("2026-01-02T00:00:00Z"))).toBe("20260102");
  });

  it("yearUtc returns the UTC year across JST year boundary", () => {
    // 2026-01-01T00:00 JST = 2025-12-31T15:00 UTC → UTC 年は 2025
    expect(yearUtc(Date.parse("2025-12-31T15:00:00Z"))).toBe("2025");
    // 2026-01-01T00:00 UTC → UTC 年は 2026
    expect(yearUtc(Date.parse("2026-01-01T00:00:00Z"))).toBe("2026");
  });

  it("ymdUtc matches real-API observed timestamp 1767225600000 → '20260101'", () => {
    expect(ymdUtc(REAL_API_JAN1_UTC)).toBe("20260101");
    expect(yearUtc(REAL_API_JAN1_UTC)).toBe("2026");
  });

  it("ymdUtc output is identical under TZ=UTC and TZ=Asia/Tokyo", () => {
    const code = `import('./cli/date-utils.ts').then(({ ymdUtc }) => process.stdout.write(ymdUtc(${REGRESSION_MS})))`;
    const utc = runUnderTz("UTC", code);
    const jst = runUnderTz("Asia/Tokyo", code);
    expect(utc).toBe(jst);
    expect(utc).toBe("20260101");
  });

  it("todayDate and isCompletePeriod are identical under TZ=UTC and TZ=Asia/Tokyo", () => {
    // 子プロセスを 2 回 spawn する間に UTC 日付境界をまたぐと todayDate が
    // ズレて flake する。Date.now() / new Date() を REGRESSION_MS に固定して回避。
    const code = [
      `const FIXED = ${REGRESSION_MS};`,
      "const RealDate = Date;",
      "globalThis.Date = class extends RealDate {",
      "  constructor(...args) {",
      "    if (args.length === 0) { super(FIXED); return; }",
      "    super(...args);",
      "  }",
      "  static now() { return FIXED; }",
      "};",
      "Promise.all([import('./cli/date-utils.ts'), import('./cli/cache.ts')]).then(([d, c]) =>",
      "process.stdout.write(JSON.stringify({",
      "today1h: d.todayDate('1hour'),",
      "today1d: d.todayDate('1day'),",
      "past: c.isCompletePeriod('20200101'),",
      "future: c.isCompletePeriod('20991231'),",
      "pastY: c.isCompletePeriod('2020'),",
      "futureY: c.isCompletePeriod('9999')",
      "})))",
    ].join(" ");
    const utc = runUnderTz("UTC", code);
    const jst = runUnderTz("Asia/Tokyo", code);
    expect(utc).toBe(jst);
    // FIXED = 2026-01-01T22:00Z で計算される値（UTC 基準）
    const parsed = JSON.parse(utc);
    expect(parsed.today1h).toBe("20260101");
    expect(parsed.today1d).toBe("2026");
  });

  it("todayDate and isCompletePeriod are callable in-process (sanity)", () => {
    // 出力値は当日依存なので形式のみ確認
    expect(todayDate("1hour")).toMatch(/^\d{8}$/);
    expect(todayDate("1day")).toMatch(/^\d{4}$/);
    expect(isCompletePeriod("20200101")).toBe(true);
    expect(isCompletePeriod("20991231")).toBe(false);
  });
});
