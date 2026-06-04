// 100行超: POST の retries 強制 0 とエラー分岐を網羅
import { describe, expect, it } from "vitest";
import { privatePost } from "../http-private-post.js";
import { mockFetchRaw, TEST_CREDS } from "./test-helpers.js";

describe("privatePost", () => {
  it("returns data on success", async () => {
    const fetch = mockFetchRaw({ success: 1, data: { orders: [] } });
    const result = await privatePost(
      "/user/spot/orders_info",
      { pair: "btc_jpy" },
      {
        fetch,
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "123",
      },
    );
    expect(result).toEqual({ success: true, data: { orders: [] } });
  });

  it("sends POST method with JSON body", async () => {
    let capturedMethod = "";
    let capturedBody = "";
    const fetch: typeof globalThis.fetch = async (_input, init) => {
      capturedMethod = init?.method ?? "";
      capturedBody = (init?.body as string) ?? "";
      return new Response(JSON.stringify({ success: 1, data: {} }));
    };
    await privatePost(
      "/user/spot/orders_info",
      { pair: "btc_jpy", order_ids: [1] },
      {
        fetch,
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "123",
      },
    );
    expect(capturedMethod).toBe("POST");
    expect(JSON.parse(capturedBody)).toEqual({ pair: "btc_jpy", order_ids: [1] });
  });

  it("sends auth headers on POST request", async () => {
    let capturedHeaders: Record<string, string> = {};
    const fetch: typeof globalThis.fetch = async (_input, init) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({ success: 1, data: {} }));
    };
    await privatePost(
      "/user/spot/orders_info",
      { pair: "btc_jpy" },
      {
        fetch,
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "123",
      },
    );
    expect(capturedHeaders["ACCESS-KEY"]).toBe("testkey");
    expect(capturedHeaders["ACCESS-NONCE"]).toBe("123");
    expect(capturedHeaders["ACCESS-SIGNATURE"]).toBeDefined();
    expect(capturedHeaders["ACCESS-TIME-WINDOW"]).toBe("5000");
  });

  it("sends Content-Type application/json on POST", async () => {
    let capturedContentType = "";
    const fetch: typeof globalThis.fetch = async (_input, init) => {
      capturedContentType = (init?.headers as Record<string, string>)["Content-Type"];
      return new Response(JSON.stringify({ success: 1, data: {} }));
    };
    await privatePost(
      "/user/spot/orders_info",
      { pair: "btc_jpy" },
      {
        fetch,
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "123",
      },
    );
    expect(capturedContentType).toBe("application/json");
  });

  it("does not retry on network exception (POST is not idempotent)", async () => {
    let calls = 0;
    const fetch: typeof globalThis.fetch = async () => {
      calls++;
      throw new Error("ECONNRESET");
    };
    const result = await privatePost(
      "/user/spot/order",
      { pair: "btc_jpy" },
      { fetch, credentials: TEST_CREDS, nonce: "123" },
    );
    expect(result.success).toBe(false);
    expect(calls).toBe(1);
  });

  it("does not retry on AbortError timeout", async () => {
    let calls = 0;
    const fetch: typeof globalThis.fetch = async () => {
      calls++;
      throw new DOMException("The operation was aborted.", "AbortError");
    };
    const result = await privatePost(
      "/user/spot/order",
      { pair: "btc_jpy" },
      { fetch, credentials: TEST_CREDS, nonce: "123" },
    );
    expect(result.success).toBe(false);
    expect(calls).toBe(1);
  });

  it("does not retry on HTTP 503 (retries: 0 forced)", async () => {
    let calls = 0;
    const fetch: typeof globalThis.fetch = async () => {
      calls++;
      return new Response("", { status: 503, statusText: "Service Unavailable" });
    };
    const result = await privatePost(
      "/user/spot/order",
      { pair: "btc_jpy" },
      { fetch, retries: 5, credentials: TEST_CREDS, nonce: "123" },
    );
    expect(result.success).toBe(false);
    expect(calls).toBe(1);
  });

  it("returns formatted error on API failure", async () => {
    const fetch = mockFetchRaw({ success: 0, data: { code: 20001 } });
    const result = await privatePost(
      "/test",
      {},
      {
        fetch,
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "123",
      },
    );
    expect(result).toMatchObject({ success: false, error: "20001: API認証失敗" });
  });
});
