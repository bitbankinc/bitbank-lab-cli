import { describe, expect, it } from "vitest";
import { signGet } from "../auth.js";
import { privateGet } from "../http-private.js";
import { TEST_CREDS, mockFetchRaw } from "./test-helpers.js";

describe("privateGet", () => {
  it("returns data on success", async () => {
    const fetch = mockFetchRaw({ success: 1, data: { assets: [] } });
    const result = await privateGet("/user/assets", undefined, {
      fetch,
      retries: 0,
      credentials: TEST_CREDS,
      nonce: "123",
    });
    expect(result).toEqual({ success: true, data: { assets: [] } });
  });

  it("returns formatted error on API failure", async () => {
    const fetch = mockFetchRaw({ success: 0, data: { code: 20001 } });
    const result = await privateGet("/user/assets", undefined, {
      fetch,
      retries: 0,
      credentials: TEST_CREDS,
      nonce: "123",
    });
    expect(result).toMatchObject({ success: false, error: "20001: API認証失敗" });
  });

  it("returns error on permission failure", async () => {
    const fetch = mockFetchRaw({ success: 0, data: { code: 20003 } });
    const result = await privateGet("/user/assets", undefined, {
      fetch,
      retries: 0,
      credentials: TEST_CREDS,
      nonce: "123",
    });
    expect(result).toMatchObject({ success: false, error: "20003: ACCESS-KEY が見つかりません" });
  });

  it("returns formatted error on insufficient amount (60001)", async () => {
    const fetch = mockFetchRaw({ success: 0, data: { code: 60001 } });
    const result = await privateGet("/user/assets", undefined, {
      fetch,
      retries: 0,
      credentials: TEST_CREDS,
      nonce: "123",
    });
    expect(result).toMatchObject({ success: false, error: "60001: 残高不足" });
  });

  it("returns error on HTTP failure", async () => {
    const fetch = mockFetchRaw({}, 500);
    const result = await privateGet("/user/assets", undefined, {
      fetch,
      retries: 0,
      credentials: TEST_CREDS,
      nonce: "123",
    });
    expect(result.success).toBe(false);
  });

  it("returns error on network failure", async () => {
    const fetch = async () => {
      throw new Error("network error");
    };
    const result = await privateGet("/user/assets", undefined, {
      fetch: fetch as typeof globalThis.fetch,
      retries: 0,
      credentials: TEST_CREDS,
      nonce: "123",
    });
    expect(result).toMatchObject({ success: false, error: "network error" });
  });

  it("returns error when credentials are missing", async () => {
    const origKey = process.env.BITBANK_API_KEY;
    const origSecret = process.env.BITBANK_API_SECRET;
    // biome-ignore lint/performance/noDelete: process.env requires delete
    delete process.env.BITBANK_API_KEY;
    // biome-ignore lint/performance/noDelete: process.env requires delete
    delete process.env.BITBANK_API_SECRET;
    const fetch = mockFetchRaw({ success: 1, data: {} });
    const result = await privateGet("/user/assets", undefined, { fetch, retries: 0 });
    expect(result.success).toBe(false);
    if (origKey) process.env.BITBANK_API_KEY = origKey;
    if (origSecret) process.env.BITBANK_API_SECRET = origSecret;
  });

  it("sends auth headers on GET request", async () => {
    let capturedHeaders: Record<string, string> = {};
    const fetch: typeof globalThis.fetch = async (_input, init) => {
      const h = init?.headers as Record<string, string>;
      capturedHeaders = h;
      return new Response(JSON.stringify({ success: 1, data: {} }));
    };
    await privateGet("/user/assets", undefined, {
      fetch,
      retries: 0,
      credentials: TEST_CREDS,
      nonce: "123",
    });
    expect(capturedHeaders["ACCESS-KEY"]).toBe("testkey");
    expect(capturedHeaders["ACCESS-NONCE"]).toBe("123");
    expect(capturedHeaders["ACCESS-SIGNATURE"]).toBeDefined();
    expect(capturedHeaders["ACCESS-TIME-WINDOW"]).toBe("5000");
  });

  it("produces correct GET signature", async () => {
    let capturedSig = "";
    const fetch: typeof globalThis.fetch = async (_input, init) => {
      capturedSig = (init?.headers as Record<string, string>)["ACCESS-SIGNATURE"];
      return new Response(JSON.stringify({ success: 1, data: {} }));
    };
    await privateGet(
      "/user/assets",
      { pair: "btc_jpy" },
      {
        fetch,
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "123",
      },
    );
    const expected = signGet("123", "/user/assets", "?pair=btc_jpy", TEST_CREDS.apiSecret);
    expect(capturedSig).toBe(expected);
  });

  it("sends query params in URL", async () => {
    let capturedUrl = "";
    const fetch: typeof globalThis.fetch = async (input) => {
      capturedUrl = input.toString();
      return new Response(JSON.stringify({ success: 1, data: {} }));
    };
    await privateGet(
      "/user/spot/order",
      { pair: "btc_jpy", order_id: "123" },
      {
        fetch,
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "123",
      },
    );
    expect(capturedUrl).toContain("pair=btc_jpy");
    expect(capturedUrl).toContain("order_id=123");
  });
});
