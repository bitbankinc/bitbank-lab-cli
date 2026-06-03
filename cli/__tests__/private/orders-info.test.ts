// 100行超: orders-info の各分岐を網羅
import { describe, expect, it } from "vitest";
import { ordersInfo } from "../../commands/private/orders-info.js";
import { orderFixture } from "../__fixtures__/private/order.js";
import { TEST_CREDS, mockFetchData, mockFetchRaw } from "../test-helpers.js";

// モックは実 API 準拠: 形状は __fixtures__/private/order.ts に集約する
// （OrderSchema を共有するため order テストと同じフィクスチャを使う）。
const MOCK_ORDERS = { orders: [orderFixture] };

describe("ordersInfo", () => {
  it("returns error when pair is missing", async () => {
    const result = await ordersInfo({ pair: undefined, orderIds: "1,2" });
    expect(result.success).toBe(false);
  });

  it("returns error when order-ids is missing", async () => {
    const result = await ordersInfo({ pair: "btc_jpy", orderIds: undefined });
    expect(result.success).toBe(false);
  });

  it("returns parsed orders", async () => {
    const result = await ordersInfo(
      { pair: "btc_jpy", orderIds: "1" },
      {
        fetch: mockFetchData(MOCK_ORDERS),
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "1",
      },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
    }
  });

  it("propagates API error", async () => {
    const result = await ordersInfo(
      { pair: "btc_jpy", orderIds: "1" },
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
    const result = await ordersInfo(
      { pair: "btc_jpy", orderIds: "1" },
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

  it("rejects non-numeric order-ids before fetching", async () => {
    const failFetch = (() => {
      throw new Error("fetch should not be called");
    }) as unknown as typeof fetch;
    const result = await ordersInfo(
      { pair: "btc_jpy", orderIds: "1,abc" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("positive integers");
  });

  it("rejects leading-comma order-ids (zero ID) before fetching", async () => {
    const failFetch = (() => {
      throw new Error("fetch should not be called");
    }) as unknown as typeof fetch;
    const result = await ordersInfo(
      { pair: "btc_jpy", orderIds: ",1,2" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("positive integers");
  });

  it("rejects order-id=0 in list before fetching", async () => {
    const failFetch = (() => {
      throw new Error("fetch should not be called");
    }) as unknown as typeof fetch;
    const result = await ordersInfo(
      { pair: "btc_jpy", orderIds: "1,0,2" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("positive integers");
  });
});
