import { describe, expect, it } from "vitest";
import { withdrawalAccounts } from "../../commands/private/withdrawal-accounts.js";
import { withdrawalAccountsFixture } from "../__fixtures__/private/withdrawal-accounts.js";
import { mockFetchData, mockFetchRaw, TEST_CREDS } from "../test-helpers.js";

// モックは実 API 準拠: 形状は __fixtures__/private/withdrawal-accounts.ts に集約する。
const MOCK = withdrawalAccountsFixture;

describe("withdrawalAccounts", () => {
  it("returns error when asset is missing", async () => {
    const result = await withdrawalAccounts({ asset: undefined });
    expect(result.success).toBe(false);
  });

  it("returns withdrawal accounts", async () => {
    const result = await withdrawalAccounts(
      { asset: "btc" },
      {
        fetch: mockFetchData(MOCK),
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "1",
      },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].network).toBe("btc");
    }
  });

  it("propagates API error", async () => {
    const result = await withdrawalAccounts(
      { asset: "btc" },
      {
        fetch: mockFetchRaw({ success: 0, data: { code: 70001 } }),
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "1",
      },
    );
    expect(result.success).toBe(false);
  });

  it("returns error on invalid response shape", async () => {
    const result = await withdrawalAccounts(
      { asset: "btc" },
      {
        fetch: mockFetchData("invalid"),
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "1",
      },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Invalid response");
  });
});
