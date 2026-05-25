import { describe, expect, it } from "vitest";
import { marginStatus } from "../../commands/private/margin-status.js";
import { TEST_CREDS, mockFetchData, mockFetchRaw } from "../test-helpers.js";

const MOCK = {
  margin_rate: "300.00",
  todays_pnl: "1000",
  open_pnl: "500",
  force_close_rate: "50.00",
  total_assets_jpy: "1000000",
  margin_used: "100000",
  margin_available: "900000",
};

describe("marginStatus", () => {
  it("returns margin status", async () => {
    const result = await marginStatus({
      fetch: mockFetchData(MOCK),
      retries: 0,
      credentials: TEST_CREDS,
      nonce: "1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.margin_rate).toBe(300);
      expect(typeof result.data.margin_rate === "number" || result.data.margin_rate === null).toBe(
        true,
      );
    }
  });

  it("propagates API error", async () => {
    const result = await marginStatus({
      fetch: mockFetchRaw({ success: 0, data: { code: 70001 } }),
      retries: 0,
      credentials: TEST_CREDS,
      nonce: "1",
    });
    expect(result.success).toBe(false);
  });

  it("returns error on invalid response shape", async () => {
    const result = await marginStatus({
      fetch: mockFetchData("invalid"),
      retries: 0,
      credentials: TEST_CREDS,
      nonce: "1",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Invalid response");
  });
});
