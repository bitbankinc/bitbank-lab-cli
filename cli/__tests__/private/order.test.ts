// 100行超: order 取得の各分岐を網羅
import { describe, expect, it } from "vitest";
import { order } from "../../commands/private/order.js";
import { orderFixture, stopOrderFixture } from "../__fixtures__/private/order.js";
import { TEST_CREDS, mockFetchData, mockFetchRaw } from "../test-helpers.js";

// モックは実 API 準拠: 形状は __fixtures__/private/order.ts に集約する
// （インライン即席モック禁止 / docs/dev/conventions.md「private モックの実 API 準拠」参照）。
const MOCK_ORDER = orderFixture;

describe("order", () => {
  it("returns error when pair is missing", async () => {
    const result = await order({ pair: undefined, orderId: "123" });
    expect(result.success).toBe(false);
  });

  it("returns error when order-id is missing", async () => {
    const result = await order({ pair: "btc_jpy", orderId: undefined });
    expect(result.success).toBe(false);
  });

  it("rejects malformed pair before fetching", async () => {
    const failFetch = (() => {
      throw new Error("fetch should not be called");
    }) as unknown as typeof fetch;
    const result = await order(
      { pair: "BTC_JPY", orderId: "12345" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("pair must be like btc_jpy");
  });

  it("rejects order-id=0 before fetching", async () => {
    const failFetch = (() => {
      throw new Error("fetch should not be called");
    }) as unknown as typeof fetch;
    const result = await order(
      { pair: "btc_jpy", orderId: "0" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("id must be a positive integer");
  });

  it("rejects non-numeric order-id before fetching", async () => {
    const failFetch = (() => {
      throw new Error("fetch should not be called");
    }) as unknown as typeof fetch;
    const result = await order(
      { pair: "btc_jpy", orderId: "abc" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("id must be a positive integer");
  });

  it("returns parsed order data", async () => {
    const result = await order(
      { pair: "btc_jpy", orderId: "12345" },
      {
        fetch: mockFetchData(MOCK_ORDER),
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "1",
      },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.order_id).toBe(12345);
      expect(result.data.pair).toBe("btc_jpy");
      // 常時返る user_cancelable が露出する
      expect(result.data.user_cancelable).toBe(true);
    }
  });

  it("exposes stop/margin fields (trigger_price, position_side, triggered_at)", async () => {
    const result = await order(
      { pair: "btc_jpy", orderId: "12346" },
      {
        fetch: mockFetchData(stopOrderFixture),
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "1",
      },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      // trigger_price は nullableNumStr で文字列 → number へ変換
      expect(result.data.trigger_price).toBe(14000000);
      expect(result.data.position_side).toBe("long");
      expect(result.data.triggered_at).toBe(1234567899999);
      expect(result.data.user_cancelable).toBe(false);
    }
  });

  it("propagates API error", async () => {
    const result = await order(
      { pair: "btc_jpy", orderId: "12345" },
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
    const result = await order(
      { pair: "btc_jpy", orderId: "12345" },
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
