import { describe, expect, it } from "vitest";
import { depositHistory } from "../../commands/private/deposit-history.js";
import { EXIT } from "../../exit-codes.js";
import { depositHistoryFixture } from "../__fixtures__/private/deposit-history.js";
import { TEST_CREDS, mockFetchData, mockFetchDataCapture, mockFetchRaw } from "../test-helpers.js";

// モックは実 API 準拠: 形状は __fixtures__/private/deposit-history.ts に集約する
// （インライン即席モック禁止 / docs/dev/conventions.md「private モックの実 API 準拠」参照）。
// フィクスチャは ①CONFIRMED/DONE（confirmed_at あり）②FOUND（confirmed_at 欠落）
// ③DONE/jpy（address・network 欠落・txid null）の 3 ケースを持つ。
const MOCK = depositHistoryFixture;

describe("depositHistory", () => {
  it("returns deposit history (crypto + jpy shapes all parse)", async () => {
    const result = await depositHistory(
      { asset: "btc" },
      {
        fetch: mockFetchData(MOCK),
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "1",
      },
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toHaveLength(3);
  });

  it("parses CONFIRMED deposit with confirmed_at present", async () => {
    const result = await depositHistory(
      { asset: "btc" },
      { fetch: mockFetchData(MOCK), retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      const done = result.data[0];
      expect(done.status).toBe("DONE");
      expect(done.confirmed_at).toBe(1234567890200);
      // address / network を露出している
      expect(done.address).toBe("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
      expect(done.network).toBe("btc");
    }
  });

  it("parses FOUND deposit with confirmed_at missing (no parse failure)", async () => {
    const result = await depositHistory(
      { asset: "btc" },
      { fetch: mockFetchData(MOCK), retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      const found = result.data[1];
      expect(found.status).toBe("FOUND");
      // キー欠落でも optional によりパース成功し、undefined になる
      expect(found.confirmed_at).toBeUndefined();
      expect(found.address).toBe("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2");
    }
  });

  it("parses JPY deposit with address/network missing (no parse failure)", async () => {
    const result = await depositHistory(
      { asset: "jpy" },
      { fetch: mockFetchData(MOCK), retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      const jpy = result.data[2];
      expect(jpy.asset).toBe("jpy");
      // 法定通貨入金は暗号資産専用フィールドを持たない。optional によりパース成功
      expect(jpy.address).toBeUndefined();
      expect(jpy.network).toBeUndefined();
      expect(jpy.txid).toBeNull();
    }
  });

  it("passes optional params (count, since, end)", async () => {
    const result = await depositHistory(
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

  it("works without asset filter", async () => {
    const result = await depositHistory(
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
    const result = await depositHistory(
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
    const result = await depositHistory(
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
    const r = await depositHistory(
      { asset: "btc", count: "-1" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.exitCode).toBe(EXIT.PARAM);
  });

  it("rejects non-integer count", async () => {
    const r = await depositHistory(
      { asset: "btc", count: "abc" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.exitCode).toBe(EXIT.PARAM);
  });

  it("rejects since > end", async () => {
    const r = await depositHistory(
      { asset: "btc", since: "9999", end: "1" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.exitCode).toBe(EXIT.PARAM);
      expect(r.error).toContain("since must be ≤ end");
    }
  });

  it("rejects malformed asset (uppercase)", async () => {
    const r = await depositHistory(
      { asset: "BTC" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.exitCode).toBe(EXIT.PARAM);
  });

  it("rejects asset with symbols", async () => {
    const r = await depositHistory(
      { asset: "bt-c" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.exitCode).toBe(EXIT.PARAM);
  });

  it("passes validated params through to URL", async () => {
    const cap = mockFetchDataCapture(MOCK);
    const r = await depositHistory(
      { asset: "btc", count: "20", since: "100", end: "200" },
      { fetch: cap.fetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(true);
    const url = cap.urls[0];
    expect(url).toContain("/user/deposit_history");
    expect(url).toContain("asset=btc");
    expect(url).toContain("count=20");
    expect(url).toContain("since=100");
    expect(url).toContain("end=200");
  });
});
