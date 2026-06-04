import { describe, expect, it } from "vitest";
import { assets } from "../../commands/private/assets.js";
import { mockFetchData, TEST_CREDS } from "../test-helpers.js";

const MOCK_ASSETS = {
  assets: [
    {
      asset: "btc",
      free_amount: "0.001",
      locked_amount: "0",
      onhand_amount: "0.001",
      withdrawing_amount: "0",
    },
    {
      asset: "jpy",
      free_amount: "10000",
      locked_amount: "0",
      onhand_amount: "10000",
      withdrawing_amount: "0",
    },
    {
      asset: "eth",
      free_amount: "0",
      locked_amount: "0",
      onhand_amount: "0",
      withdrawing_amount: "0",
    },
  ],
};

describe("assets", () => {
  it("returns non-zero assets by default", async () => {
    const result = await assets(
      { showAll: false },
      {
        fetch: mockFetchData(MOCK_ASSETS),
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "1",
      },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0].asset).toBe("btc");
      expect(typeof result.data[0].free_amount).toBe("number");
      expect(result.data[0].free_amount).toBe(0.001);
      expect(result.data[0].onhand_amount).toBe(0.001);
    }
  });

  it("returns all assets with showAll=true", async () => {
    const result = await assets(
      { showAll: true },
      {
        fetch: mockFetchData(MOCK_ASSETS),
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "1",
      },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(3);
    }
  });

  it("returns error on invalid response", async () => {
    const result = await assets(
      { showAll: false },
      {
        fetch: mockFetchData({ bad: "data" }),
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "1",
      },
    );
    expect(result.success).toBe(false);
  });
});
