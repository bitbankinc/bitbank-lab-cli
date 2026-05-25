import { describe, expect, it, vi } from "vitest";
import { depth } from "../../../commands/public/depth.js";
import { output } from "../../../output.js";
import { mockFetchData } from "../../test-helpers.js";

const MOCK_DEPTH = {
  asks: [
    ["5001000", "0.1"],
    ["5002000", "0.2"],
  ],
  bids: [
    ["5000000", "0.3"],
    ["4999000", "0.4"],
  ],
  timestamp: 1700000000000,
};

describe("Chaos P-09: depth output in all formats", () => {
  it("json format does not crash", async () => {
    const r = await depth(
      { pair: "btc_jpy" },
      {
        fetch: mockFetchData(MOCK_DEPTH),
        retries: 0,
      },
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(typeof r.data.asks[0][0]).toBe("number");
      expect(r.data.asks[0][0]).toBe(5001000);
    }
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    output(r, "json");
    const out = spy.mock.calls.map((c) => c[0]).join("");
    expect(out).toContain("5001000");
    spy.mockRestore();
  });

  it("table format does not crash", async () => {
    const r = await depth(
      { pair: "btc_jpy" },
      {
        fetch: mockFetchData(MOCK_DEPTH),
        retries: 0,
      },
    );
    expect(r.success).toBe(true);
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    output(r, "table");
    const out = spy.mock.calls.map((c) => c[0]).join("");
    expect(out.length).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it("csv format does not crash", async () => {
    const r = await depth(
      { pair: "btc_jpy" },
      {
        fetch: mockFetchData(MOCK_DEPTH),
        retries: 0,
      },
    );
    expect(r.success).toBe(true);
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    output(r, "csv");
    const out = spy.mock.calls.map((c) => c[0]).join("");
    expect(out.length).toBeGreaterThan(0);
    spy.mockRestore();
  });
});
