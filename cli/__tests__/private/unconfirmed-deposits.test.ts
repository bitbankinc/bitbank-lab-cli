import { describe, expect, it } from "vitest";
import { unconfirmedDeposits } from "../../commands/private/unconfirmed-deposits.js";
import { EXIT } from "../../exit-codes.js";
import { unconfirmedDepositsFixture } from "../__fixtures__/private/unconfirmed-deposits.js";
import { TEST_CREDS, mockFetchData, mockFetchDataCapture, mockFetchRaw } from "../test-helpers.js";

const MOCK = unconfirmedDepositsFixture;

describe("unconfirmedDeposits", () => {
  it("returns unconfirmed deposits", async () => {
    const result = await unconfirmedDeposits(
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
      // 実 API 形状（created_at は number、network あり、found_at なし）が通ること。
      expect(result.data[0].created_at).toBe(1234567890123);
      expect(typeof result.data[0].created_at).toBe("number");
      expect(result.data[0].network).toBe("btc");
      expect(result.data[0]).not.toHaveProperty("found_at");
    }
  });

  it("works without asset filter", async () => {
    const result = await unconfirmedDeposits(
      {},
      {
        fetch: mockFetchData(MOCK),
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "1",
      },
    );
    expect(result.success).toBe(true);
  });

  it("propagates API error", async () => {
    const result = await unconfirmedDeposits(
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
    const result = await unconfirmedDeposits(
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

  const failFetch = (() => {
    throw new Error("fetch should not be called");
  }) as unknown as typeof fetch;

  it("rejects malformed asset (uppercase)", async () => {
    const r = await unconfirmedDeposits(
      { asset: "BTC" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.exitCode).toBe(EXIT.PARAM);
  });

  it("rejects asset with symbols", async () => {
    const r = await unconfirmedDeposits(
      { asset: "bt_c" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.exitCode).toBe(EXIT.PARAM);
  });

  it("rejects empty asset string", async () => {
    const r = await unconfirmedDeposits(
      { asset: "" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.exitCode).toBe(EXIT.PARAM);
  });

  it("passes validated asset through to URL", async () => {
    const cap = mockFetchDataCapture(MOCK);
    const r = await unconfirmedDeposits(
      { asset: "eth" },
      { fetch: cap.fetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(true);
    const url = cap.urls[0];
    expect(url).toContain("/user/unconfirmed_deposits");
    expect(url).toContain("asset=eth");
  });
});
