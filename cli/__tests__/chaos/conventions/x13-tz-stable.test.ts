import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { isCompletePeriod } from "../../../cache.js";
import { todayDate, yearJst, ymdJst } from "../../../date-utils.js";

// bitbank API は JST 基準で日付境界を扱うため、CLI 内の日付フォーマッタは
// ホスト TZ に依存してはならない。回帰例: UTC ホストで 22:00 UTC（JST 翌日 07:00）
// に paper tick を回すと、JST 翌日のはずの 1min candle を UTC 当日（JST 前日）の
// 日付で fetch して全件除外され、指値が静かに約定しない。

// 2026-01-01T22:00:00Z = 2026-01-02 07:00 JST（UTC では「同日」、JST では「翌日」）
const REGRESSION_MS = Date.parse("2026-01-01T22:00:00Z");

function runUnderTz(tz: string, code: string): string {
  return execSync(`npx tsx -e ${JSON.stringify(code)}`, {
    encoding: "utf-8",
    env: { ...process.env, TZ: tz },
  });
}

describe("Chaos X-13: date utilities are TZ-stable (JST 固定)", () => {
  it("ymdJst returns the JST date even when host is UTC", () => {
    expect(ymdJst(REGRESSION_MS)).toBe("20260102");
    // JST 境界の前後を確認
    expect(ymdJst(Date.parse("2026-01-01T14:59:59Z"))).toBe("20260101");
    expect(ymdJst(Date.parse("2026-01-01T15:00:00Z"))).toBe("20260102");
  });

  it("yearJst returns the JST year across UTC year boundary", () => {
    // 2025-12-31T20:00 JST = 2025-12-31T11:00 UTC → JST 年は 2025
    expect(yearJst(Date.parse("2025-12-31T11:00:00Z"))).toBe("2025");
    // 2026-01-01T00:00 JST = 2025-12-31T15:00 UTC → JST 年は 2026
    expect(yearJst(Date.parse("2025-12-31T15:00:00Z"))).toBe("2026");
  });

  it("ymdJst output is identical under TZ=UTC and TZ=Asia/Tokyo", () => {
    const code = `import('./cli/date-utils.ts').then(({ ymdJst }) => process.stdout.write(ymdJst(${REGRESSION_MS})))`;
    const utc = runUnderTz("UTC", code);
    const jst = runUnderTz("Asia/Tokyo", code);
    expect(utc).toBe(jst);
    expect(utc).toBe("20260102");
  });

  it("todayDate and isCompletePeriod are identical under TZ=UTC and TZ=Asia/Tokyo", () => {
    // 子プロセスを 2 回 spawn する間に JST 日付境界をまたぐと todayDate が
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
    // FIXED = 2026-01-01T22:00Z = JST 2026-01-02 07:00 で計算される値
    const parsed = JSON.parse(utc);
    expect(parsed.today1h).toBe("20260102");
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
