import { describe, expect, it, vi } from "vitest";
import { privateGet } from "../../../http-private.js";
import { privatePost } from "../../../http-private-post.js";
import { mockFetchRaw, TEST_CREDS } from "../../test-helpers.js";

const AUTH_ERROR = { success: 0, data: { code: 20001 } };

describe("Chaos A-05: HTTP 401 returns { success: false }", () => {
  it("privateGet returns error with auth error code", async () => {
    const r = await privateGet("/user/assets", undefined, {
      fetch: mockFetchRaw(AUTH_ERROR),
      retries: 0,
      credentials: TEST_CREDS,
      nonce: "1",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBeTruthy();
  });

  it("privatePost returns error with auth error code", async () => {
    const r = await privatePost(
      "/user/spot/order",
      { pair: "btc_jpy" },
      {
        fetch: mockFetchRaw(AUTH_ERROR),
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "1",
      },
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBeTruthy();
  });

  it("HTTP 401 status also returns error", async () => {
    const r = await privateGet("/user/assets", undefined, {
      fetch: mockFetchRaw({ success: 0, data: { code: 20001 } }, 401),
      retries: 0,
      credentials: TEST_CREDS,
      nonce: "1",
    });
    expect(r.success).toBe(false);
  });

  it("missing credentials returns auth error without calling fetch", async () => {
    const origKey = process.env.BITBANK_API_KEY;
    const origSecret = process.env.BITBANK_API_SECRET;
    delete process.env.BITBANK_API_KEY;
    delete process.env.BITBANK_API_SECRET;
    try {
      const fetchSpy = vi.fn();
      const r = await privateGet("/user/assets", undefined, {
        fetch: fetchSpy,
        retries: 0,
      });
      expect(r.success).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      if (origKey !== undefined) process.env.BITBANK_API_KEY = origKey;
      if (origSecret !== undefined) process.env.BITBANK_API_SECRET = origSecret;
    }
  });
});
