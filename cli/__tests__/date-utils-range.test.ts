import { describe, expect, it } from "vitest";
import { ymdUtcRange } from "../date-utils.js";

const P = Date.parse;

describe("ymdUtcRange", () => {
  it("lists every UTC date the window touches, including the middle one", () => {
    // 信用の走査の窓（前回 00:30Z の 1 時間前から、翌日 00:20Z まで）は 3 日にまたがる
    expect(ymdUtcRange(P("2026-10-31T23:30:00Z"), P("2026-11-02T00:20:00Z"))).toEqual([
      "20261031",
      "20261101",
      "20261102",
    ]);
  });

  it("crosses month and year ends, gives one date within a day, and [] for an empty window", () => {
    expect(ymdUtcRange(P("2026-12-31T12:00:00Z"), P("2027-01-01T01:00:00Z"))).toEqual([
      "20261231",
      "20270101",
    ]);
    expect(ymdUtcRange(P("2026-11-01T00:00:00Z"), P("2026-11-01T23:59:59Z"))).toEqual(["20261101"]);
    expect(ymdUtcRange(P("2026-11-02T00:00:00Z"), P("2026-11-01T00:00:00Z"))).toEqual([]);
  });
});
