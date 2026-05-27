import { describe, expect, it } from "vitest";
import { activeOrders } from "../../commands/private/active-orders.js";
import { TEST_CREDS, mockFetchData, mockFetchDataCapture, mockFetchRaw } from "../test-helpers.js";

const MOCK = {
  orders: [
    {
      order_id: 1,
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      start_amount: "0.001",
      remaining_amount: "0.001",
      executed_amount: "0",
      price: "15000000",
      average_price: "0",
      ordered_at: 1234567890123,
      expire_at: null,
      status: "UNFILLED",
    },
  ],
};

describe("activeOrders", () => {
  it("returns active orders", async () => {
    const result = await activeOrders(
      { pair: "btc_jpy" },
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

  it("works without pair (all pairs)", async () => {
    const result = await activeOrders(
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

  it("passes optional params (count, since, end)", async () => {
    const result = await activeOrders(
      { pair: "btc_jpy", count: "10", since: "1000", end: "2000" },
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
    const result = await activeOrders(
      { pair: "btc_jpy" },
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
    const result = await activeOrders(
      { pair: "btc_jpy" },
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

  it("rejects negative count before fetching", async () => {
    const r = await activeOrders(
      { pair: "btc_jpy", count: "-5" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("count");
  });

  it("rejects count above API limit", async () => {
    const r = await activeOrders(
      { pair: "btc_jpy", count: "10000" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("count");
  });

  it("rejects since > end", async () => {
    const r = await activeOrders(
      { pair: "btc_jpy", since: "5000", end: "1000" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("since must be ≤ end");
  });

  it("rejects malformed pair", async () => {
    const r = await activeOrders(
      { pair: "BTC_JPY" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(false);
  });

  it("passes validated params through to URL", async () => {
    const cap = mockFetchDataCapture(MOCK);
    const r = await activeOrders(
      { pair: "btc_jpy", count: "5", since: "1000", end: "2000" },
      { fetch: cap.fetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(true);
    const url = cap.urls[0];
    expect(url).toContain("/user/spot/active_orders");
    expect(url).toContain("pair=btc_jpy");
    expect(url).toContain("count=5");
    expect(url).toContain("since=1000");
    expect(url).toContain("end=2000");
  });
});
