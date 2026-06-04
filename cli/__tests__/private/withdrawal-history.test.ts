import { describe, expect, it } from "vitest";
import { withdrawalHistory } from "../../commands/private/withdrawal-history.js";
import { EXIT } from "../../exit-codes.js";
import { withdrawalHistoryFixture } from "../__fixtures__/private/withdrawal-history.js";
import { mockFetchData, mockFetchDataCapture, mockFetchRaw, TEST_CREDS } from "../test-helpers.js";

// モックは実 API 準拠: 形状は __fixtures__/private/withdrawal-history.ts に集約する
// （インライン即席モック禁止 / docs/dev/conventions.md「private モックの実 API 準拠」参照）。
// フィクスチャは ①crypto 出金（address/network/txid/destination_tag あり）
// ②fiat/jpy 出金（bank_* あり・crypto 専用フィールド欠落）の 2 ケースを持つ。
const MOCK = withdrawalHistoryFixture;

describe("withdrawalHistory", () => {
  it("returns error when asset is missing", async () => {
    const result = await withdrawalHistory({ asset: undefined as unknown as string });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.exitCode).toBe(EXIT.PARAM);
  });

  it("returns withdrawal history (crypto + fiat shapes all parse)", async () => {
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
    if (result.success) expect(result.data).toHaveLength(2);
  });

  it("parses crypto withdrawal with address/network/txid/destination_tag", async () => {
    const result = await withdrawalHistory(
      { asset: "xrp" },
      { fetch: mockFetchData(MOCK), retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      const crypto = result.data[0];
      expect(crypto.account_uuid).toBe("aaaa1111-bbbb-2222-cccc-333333333333");
      expect(crypto.address).toBe("rLW9gnQo7BQhU6igk5keqYnH3TVrCxGRzm");
      expect(crypto.network).toBe("xrp");
      expect(crypto.destination_tag).toBe(123456);
      expect(crypto.txid).toBe("tx123abc");
    }
  });

  it("parses fiat (jpy) withdrawal with address missing (no parse failure)", async () => {
    const result = await withdrawalHistory(
      { asset: "jpy" },
      { fetch: mockFetchData(MOCK), retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      const fiat = result.data[1];
      expect(fiat.asset).toBe("jpy");
      // 銀行振込のため暗号資産専用フィールドは欠落。optional によりパース成功
      expect(fiat.address).toBeUndefined();
      expect(fiat.network).toBeUndefined();
      expect(fiat.txid).toBeUndefined();
      // fiat 専用フィールドを露出している
      expect(fiat.bank_name).toBe("bitbank bank");
      expect(fiat.branch_name).toBe("head office");
      expect(fiat.account_type).toBe("ordinary");
      expect(fiat.account_number).toBe("1234567");
      expect(fiat.account_owner).toBe("TARO YAMADA");
    }
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
