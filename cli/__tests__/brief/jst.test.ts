import { describe, expect, it } from "vitest";
import { jstParts } from "../../brief/jst.js";
import { fmtPct, fmtPrice, fmtVol, renderHeader } from "../../brief/render.js";

describe("jstParts", () => {
  it("shifts UTC into JST and maps weekday Mon=0 … Sun=6", () => {
    // 2026-08-01T22:30:00Z = 2026-08-02 07:30 JST (Sunday)
    const j = jstParts(Date.parse("2026-08-01T22:30:00Z"));
    expect(j).toEqual({
      date: "2026-08-02",
      monthDay: "08-02",
      weekdayIndex: 6,
      weekday: "Sun",
      time: "07:30",
    });
    // A bitbank 1day candle timestamp (UTC 00:00) lands on the same JST calendar date
    expect(jstParts(Date.UTC(2026, 7, 3)).weekday).toBe("Mon");
  });
});

describe("render helpers", () => {
  it("formats prices by magnitude and volumes with one decimal", () => {
    expect(fmtPrice(9919488.4)).toBe("9,919,488");
    expect(fmtPrice(312.3456)).toBe("312.35");
    expect(fmtPrice(0.98765)).toBe("0.9877");
    expect(fmtPrice(-1234.5)).toBe("-1,235");
    expect(fmtPrice(null)).toBe("n/a");
    expect(fmtVol(42.12)).toBe("42.1");
    expect(fmtVol(1234567.89)).toBe("1,234,567.9");
  });

  it("signs percentages", () => {
    expect(fmtPct(0.21)).toBe("+0.2%");
    expect(fmtPct(-0.25)).toBe("-0.3%");
    expect(fmtPct(0)).toBe("0.0%");
  });

  it("renders the header in JST", () => {
    expect(renderHeader(Date.parse("2026-08-02T01:30:00Z"), 3)).toBe(
      "# bitbank periodical brief 2026-08-02 Sun JST 10:30  (3 pairs)",
    );
  });
});
