import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { jstIso, jstYear, jstYearRangeMs, yearUtc } from "../date-utils.js";

// 税務の年分は JST（1/1〜12/31）。API の UTC 境界とは別系統（ADR-004 の例外）。
// 核心の回帰: JST 元日 00:00 は UTC では前年 12/31 15:00。UTC 年で集計すると
// 年始・年末の取引が隣の年分に漏れる。jstYear はこれを JST 基準で正す。

// #1 実機確認で live API の deposit-history --end に渡した値（2026-01-01 00:00 JST）
const JST_2026_START = 1767193200000;

function runUnderTz(tz: string, code: string): string {
  return execSync(`npx tsx -e ${JSON.stringify(code)}`, {
    encoding: "utf-8",
    env: { ...process.env, TZ: tz },
  });
}

describe("JST year helpers (税務の年分判定・ADR-004 例外)", () => {
  it("jstYear differs from yearUtc across the JST new-year boundary", () => {
    // 2025-12-31T15:00:00Z = 2026-01-01T00:00:00+09:00
    const ms = Date.parse("2025-12-31T15:00:00Z");
    expect(jstYear(ms)).toBe(2026);
    expect(yearUtc(ms)).toBe("2025"); // UTC 集計だと前年に漏れる
  });

  it("jstYear respects the JST year-end boundary (23:59:59 JST)", () => {
    // 2025-12-31T14:59:59Z = 2025-12-31T23:59:59+09:00
    expect(jstYear(Date.parse("2025-12-31T14:59:59Z"))).toBe(2025);
    // 1ms 後 = 2026-01-01T00:00:00+09:00
    expect(jstYear(Date.parse("2025-12-31T15:00:00Z"))).toBe(2026);
  });

  it("jstYearRangeMs(2026) returns the verified half-open [start, end)", () => {
    const { startMs, endMs } = jstYearRangeMs(2026);
    expect(startMs).toBe(JST_2026_START); // live API に渡した実測値と一致
    expect(endMs).toBe(1798729200000);
    // 半開区間の端点の帰属: start は 2026、end は翌年、end-1ms は 2026
    expect(jstYear(startMs)).toBe(2026);
    expect(jstYear(endMs)).toBe(2027);
    expect(jstYear(endMs - 1)).toBe(2026);
  });

  it("jstYearRangeMs is contiguous year over year (前年 end == 当年 start)", () => {
    expect(jstYearRangeMs(2025).endMs).toBe(jstYearRangeMs(2026).startMs);
  });

  it("jstIso renders the +09:00 wall-clock time", () => {
    expect(jstIso(Date.parse("2025-12-31T15:00:00Z"))).toBe("2026-01-01T00:00:00+09:00");
    // ETH 建て約定の実測 executed_at（#2）
    expect(jstIso(1784713734195)).toBe("2026-07-22T18:48:54+09:00");
  });

  it("output is identical under TZ=UTC and TZ=Asia/Tokyo (host-TZ 非依存)", () => {
    const code =
      `import('./cli/date-utils.ts').then(({ jstYear, jstYearRangeMs, jstIso }) => ` +
      `process.stdout.write(JSON.stringify({ ` +
      `y: jstYear(${JST_2026_START}), r: jstYearRangeMs(2026), iso: jstIso(1784713734195) })))`;
    const utc = runUnderTz("UTC", code);
    const jst = runUnderTz("Asia/Tokyo", code);
    expect(utc).toBe(jst);
    const parsed = JSON.parse(utc);
    expect(parsed.y).toBe(2026);
    expect(parsed.iso).toBe("2026-07-22T18:48:54+09:00");
  });
});
