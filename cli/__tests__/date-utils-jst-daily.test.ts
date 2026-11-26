import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { jstDailyInstants } from "../date-utils.js";

// paper の信用の日次処理（ADR-010 決定 7）。利息は JST 0 時、追証は毎日 JST 15 時。
// JST 0 時は UTC の前日 15:00、JST 15 時は UTC の当日 06:00。
const P = Date.parse;
const iso = (ms: number[]) => ms.map((t) => new Date(t).toISOString());

describe("jstDailyInstants", () => {
  it("includes the end instant and excludes the start (just opened = no interest yet)", () => {
    const midnight = P("2026-11-01T15:00:00Z"); // 2026-11-02 00:00 JST
    expect(iso(jstDailyInstants(midnight - 1, midnight, 0))).toEqual(["2026-11-01T15:00:00.000Z"]);
    expect(jstDailyInstants(midnight, midnight + 1, 0)).toEqual([]);
  });

  it("a full 24h after opening still crosses JST midnight only once", () => {
    const open = P("2026-11-01T01:00:00Z"); // 10:00 JST
    expect(jstDailyInstants(open, open + 24 * 3600_000, 0)).toHaveLength(1);
  });

  it("lists every midnight across several days in order", () => {
    expect(iso(jstDailyInstants(P("2026-11-01T01:00:00Z"), P("2026-11-04T01:00:00Z"), 0))).toEqual([
      "2026-11-01T15:00:00.000Z",
      "2026-11-02T15:00:00.000Z",
      "2026-11-03T15:00:00.000Z",
    ]);
  });

  it("handles the margin-call base time (15:00 JST = 06:00 UTC)", () => {
    expect(iso(jstDailyInstants(P("2026-11-01T00:00:00Z"), P("2026-11-02T00:00:00Z"), 15))).toEqual(
      ["2026-11-01T06:00:00.000Z"],
    );
  });

  it("crosses the JST new year like any other midnight", () => {
    expect(iso(jstDailyInstants(P("2026-12-31T14:00:00Z"), P("2026-12-31T16:00:00Z"), 0))).toEqual([
      "2026-12-31T15:00:00.000Z", // 2027-01-01 00:00 JST
    ]);
  });

  it.each([
    ["empty interval", 10, 10, 0],
    ["reversed interval", 10, 5, 0],
    ["hour 24", 0, 10 * 86_400_000, 24],
    ["negative hour", 0, 10 * 86_400_000, -1],
    ["fractional hour", 0, 10 * 86_400_000, 1.5],
    ["NaN start", Number.NaN, 10, 0],
  ])("returns [] for %s", (_label, from, to, hour) => {
    expect(jstDailyInstants(from, to, hour)).toEqual([]);
  });

  it("gives the same instants under TZ=UTC, Asia/Tokyo and America/New_York (DST)", () => {
    const code = `import('./cli/date-utils.ts').then(({ jstDailyInstants }) => process.stdout.write(JSON.stringify(jstDailyInstants(${P("2026-03-07T00:00:00Z")}, ${P("2026-03-10T00:00:00Z")}, 0))))`;
    const run = (tz: string) =>
      execSync(`npx tsx -e ${JSON.stringify(code)}`, {
        encoding: "utf-8",
        env: { ...process.env, TZ: tz },
      });
    const utc = run("UTC");
    expect(run("Asia/Tokyo")).toBe(utc);
    expect(run("America/New_York")).toBe(utc); // 2026-03-08 に夏時間へ切り替わる
    expect(iso(JSON.parse(utc))).toEqual([
      "2026-03-07T15:00:00.000Z",
      "2026-03-08T15:00:00.000Z",
      "2026-03-09T15:00:00.000Z",
    ]);
  });
});
