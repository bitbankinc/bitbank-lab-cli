import { describe, expect, it } from "vitest";
import { withdrawalHistory } from "../../commands/private/withdrawal-history.js";
import { EXIT } from "../../exit-codes.js";
import { TEST_CREDS, mockFetchData, mockFetchDataCapture, mockFetchRaw } from "../test-helpers.js";

const MOCK = {
  withdrawals: [
    {
      uuid: "abc",
      asset: "btc",
      amount: "0.1",
      fee: "0.0005",
      label: "main",
      address: "1A1zP1...",
      txid: "tx123",
      status: "DONE",
      requested_at: 1234567890123,
    },
  ],
};

describe("withdrawalHistory", () => {
  it("returns error when asset is missing", async () => {
    const result = await withdrawalHistory({ asset: undefined as unknown as string });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.exitCode).toBe(EXIT.PARAM);
  });

  it("returns withdrawal history", async () => {
    const result = await withdrawalHistory(
      { asset: "btc" },
      {
        fetch: mockFetchData(MOCK),
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "1",
      },
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toHaveLength(1);
  });

  it("passes optional params (count, since, end)", async () => {
    const result = await withdrawalHistory(
      { asset: "btc", count: "10", since: "1000", end: "2000" },
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
    const result = await withdrawalHistory(
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
    const result = await withdrawalHistory(
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

  it("rejects negative count", async () => {
    const r = await withdrawalHistory(
      { asset: "btc", count: "-3" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.exitCode).toBe(EXIT.PARAM);
  });

  it("rejects count=0", async () => {
    const r = await withdrawalHistory(
      { asset: "btc", count: "0" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.exitCode).toBe(EXIT.PARAM);
  });

  it("rejects since > end", async () => {
    const r = await withdrawalHistory(
      { asset: "btc", since: "5000", end: "1000" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.exitCode).toBe(EXIT.PARAM);
      expect(r.error).toContain("since must be ≤ end");
    }
  });

  it("rejects malformed asset (uppercase)", async () => {
    const r = await withdrawalHistory(
      { asset: "BTC" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.exitCode).toBe(EXIT.PARAM);
  });

  it("rejects non-integer since (negative)", async () => {
    const r = await withdrawalHistory(
      { asset: "btc", since: "-1" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.exitCode).toBe(EXIT.PARAM);
  });

  it("passes validated params through to URL", async () => {
    const cap = mockFetchDataCapture(MOCK);
    const r = await withdrawalHistory(
      { asset: "btc", count: "30", since: "100", end: "500" },
      { fetch: cap.fetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(true);
    const url = cap.urls[0];
    expect(url).toContain("/user/withdrawal_history");
    expect(url).toContain("asset=btc");
    expect(url).toContain("count=30");
    expect(url).toContain("since=100");
    expect(url).toContain("end=500");
  });
});
