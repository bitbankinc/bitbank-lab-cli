import { describe, expect, it } from "vitest";
import { depth } from "../../commands/public/depth.js";
import { mockFetchData, mockFetchRaw } from "../test-helpers.js";

const MOCK_DEPTH = {
  asks: [
    ["100", "1.0"],
    ["101", "2.0"],
  ],
  bids: [["99", "1.5"]],
  timestamp: 1000,
};

describe("depth", () => {
  it("returns error when pair is missing", async () => {
    const result = await depth({ pair: undefined });
    expect(result.success).toBe(false);
  });

  it("returns parsed depth", async () => {
    const result = await depth(
      { pair: "btc_jpy" },
      { fetch: mockFetchData(MOCK_DEPTH), retries: 0 },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.asks).toHaveLength(2);
      expect(result.data.bids).toHaveLength(1);
      expect(typeof result.data.asks[0][0]).toBe("number");
      expect(typeof result.data.asks[0][1]).toBe("number");
      expect(result.data.asks[0][0]).toBe(100);
      expect(result.data.asks[0][1]).toBe(1);
    }
  });

  it("propagates API error", async () => {
    const result = await depth(
      { pair: "btc_jpy" },
      {
        fetch: mockFetchRaw({ success: 0, data: { code: 70001 } }),
        retries: 0,
      },
    );
    expect(result.success).toBe(false);
  });

  it("returns error on invalid response shape", async () => {
    const result = await depth(
      { pair: "btc_jpy" },
      { fetch: mockFetchData("invalid"), retries: 0 },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Invalid response");
  });
});
