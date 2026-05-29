// 100行超: HTTP リトライ/レート制限/タイムアウト分岐を網羅
import { describe, expect, it, vi } from "vitest";
import { publicGet } from "../http.js";
import { mockFetchRaw } from "./test-helpers.js";

describe("publicGet", () => {
  it("returns data on success", async () => {
    const fetch = mockFetchRaw({ success: 1, data: { sell: "100" } });
    const result = await publicGet("/btc_jpy/ticker", { fetch, retries: 0 });
    expect(result).toEqual({ success: true, data: { sell: "100" } });
  });

  it("returns error on API failure", async () => {
    const fetch = mockFetchRaw({ success: 0, data: { code: 10000 } });
    const result = await publicGet("/bad", { fetch, retries: 0 });
    expect(result).toMatchObject({ success: false, error: "10000: URL不正" });
  });

  it("returns error on HTTP failure after retries", async () => {
    const fetch = mockFetchRaw({}, 500);
    const result = await publicGet("/bad", { fetch, retries: 0 });
    expect(result.success).toBe(false);
  });

  it("does not retry on API error code 60001 (insufficient amount)", async () => {
    let calls = 0;
    const fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ success: 0, data: { code: 60001 } }));
    };
    const result = await publicGet("/test", {
      fetch: fetch as typeof globalThis.fetch,
      retries: 3,
    });
    expect(result.success).toBe(false);
    expect(calls).toBe(1);
  });

  it("returns error on network failure", async () => {
    const fetch = async () => {
      throw new Error("network error");
    };
    const result = await publicGet("/x", { fetch: fetch as typeof globalThis.fetch, retries: 0 });
    expect(result).toMatchObject({ success: false, error: "network error" });
  });

  it("retries on HTTP 429 then succeeds", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fetch: typeof globalThis.fetch = async () => {
      calls++;
      if (calls === 1) return new Response("", { status: 429 });
      return new Response(JSON.stringify({ success: 1, data: { ok: true } }));
    };
    const p = publicGet("/test", { fetch, retries: 1 });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await p;
    expect(result).toEqual({ success: true, data: { ok: true } });
    expect(calls).toBe(2);
    vi.useRealTimers();
  });

  it("retries on HTTP 500 then succeeds", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fetch: typeof globalThis.fetch = async () => {
      calls++;
      if (calls === 1) return new Response("", { status: 500 });
      return new Response(JSON.stringify({ success: 1, data: { ok: true } }));
    };
    const p = publicGet("/test", { fetch, retries: 1 });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await p;
    expect(result).toEqual({ success: true, data: { ok: true } });
    expect(calls).toBe(2);
    vi.useRealTimers();
  });

  it("returns error when retries exhausted", async () => {
    vi.useFakeTimers();
    const fetch = mockFetchRaw({}, 500);
    const p = publicGet("/test", { fetch, retries: 1 });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await p;
    expect(result.success).toBe(false);
    vi.useRealTimers();
  });

  it("returns error on timeout", async () => {
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      });
    };
    const result = await publicGet("/test", { fetch, retries: 0, timeoutMs: 50 });
    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toContain("abort");
  });

  it("retries on network exception then succeeds (GET regression)", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fetch: typeof globalThis.fetch = async () => {
      calls++;
      if (calls === 1) throw new Error("ECONNRESET");
      return new Response(JSON.stringify({ success: 1, data: { ok: true } }));
    };
    const p = publicGet("/test", { fetch, retries: 1 });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await p;
    expect(result).toEqual({ success: true, data: { ok: true } });
    expect(calls).toBe(2);
    vi.useRealTimers();
  });

  it("maps 60001 to coded message via publicGet's parseError contract", async () => {
    // publicGet も private と共通でコードマッピング（formatApiError）を通す。
    // public/private のエラー文字列は同形式 "<code>: <和訳>" に揃っている。
    const fetch: typeof globalThis.fetch = async () =>
      new Response(JSON.stringify({ success: 0, data: { code: 60001 } }));
    const result = await publicGet("/test", { fetch, retries: 0 });
    expect(result).toMatchObject({ success: false, error: "60001: 残高不足" });
  });
});
