import { describe, expect, it } from "vitest";
import { status } from "../../commands/public/status.js";
import { mockFetchData, mockFetchRaw } from "../test-helpers.js";

const MOCK_DATA = {
  statuses: [{ pair: "btc_jpy", status: "NORMAL", min_amount: "0.0001" }],
};

describe("status", () => {
  it("returns parsed statuses", async () => {
    const result = await status({ fetch: mockFetchData(MOCK_DATA), retries: 0 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].pair).toBe("btc_jpy");
      expect(result.data[0].status).toBe("NORMAL");
    }
  });

  it("requests api.bitbank.cc (not public.bitbank.cc)", async () => {
    let capturedUrl = "";
    const captureFetch: typeof globalThis.fetch = async (input) => {
      capturedUrl = input.toString();
      return new Response(JSON.stringify({ success: 1, data: MOCK_DATA }));
    };
    await status({ fetch: captureFetch, retries: 0 });
    expect(capturedUrl).toBe("https://api.bitbank.cc/v1/spot/status");
  });

  it("propagates API error", async () => {
    const result = await status({
      fetch: mockFetchRaw({ success: 0, data: { code: 70001 } }),
      retries: 0,
    });
    expect(result.success).toBe(false);
  });

  it("returns error on invalid response shape", async () => {
    const result = await status({ fetch: mockFetchData("invalid"), retries: 0 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Invalid response");
  });
});
