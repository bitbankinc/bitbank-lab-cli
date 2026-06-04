import { describe, expect, it, vi } from "vitest";
import { tradeHistory, tradeHistoryDispatch } from "../../commands/private/trade-history.js";
import { tradeHistoryAll } from "../../commands/private/trade-history-all.js";
import { EXIT } from "../../exit-codes.js";
import { tradeHistoryFixture } from "../__fixtures__/private/trade-history.js";
import { mockFetchData, mockFetchDataCapture, TEST_CREDS } from "../test-helpers.js";

vi.mock("../../commands/private/trade-history-all.js", () => ({
  tradeHistoryAll: vi.fn(async (args: { pair?: string }) => {
    if (!args.pair) return { success: false, error: "pair required" };
    return { success: true, data: [{ pair: args.pair, marker: "all" }] };
  }),
}));

// モックは実 API 準拠: 形状は __fixtures__/private/trade-history.ts に集約する。
const MOCK = tradeHistoryFixture;

describe("tradeHistory", () => {
  it("returns error when pair is missing", async () => {
    const result = await tradeHistory({ pair: undefined });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.exitCode).toBe(EXIT.PARAM);
  });

  it("returns trade history", async () => {
    const result = await tradeHistory(
      { pair: "btc_jpy" },
      {
        fetch: mockFetchData(MOCK),
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "1",
      },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      // 新規露出フィールドが文字列 → number へ変換されて出る
      expect(result.data[0].fee_occurred_amount_quote).toBe(0);
      expect(result.data[0].profit_loss).toBe(1000);
      expect(result.data[0].interest).toBe(-5);
      expect(result.data[0].position_side).toBe("long");
    }
  });

  const failFetch = (() => {
    throw new Error("fetch should not be called");
  }) as unknown as typeof fetch;

  it("rejects negative count", async () => {
    const r = await tradeHistory(
      { pair: "btc_jpy", count: "-1" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.exitCode).toBe(EXIT.PARAM);
      expect(r.error).toContain("count");
    }
  });

  it("rejects count=0", async () => {
    const r = await tradeHistory(
      { pair: "btc_jpy", count: "0" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.exitCode).toBe(EXIT.PARAM);
      expect(r.error).toContain("count");
    }
  });

  it("rejects non-integer count", async () => {
    const r = await tradeHistory(
      { pair: "btc_jpy", count: "10.5" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.exitCode).toBe(EXIT.PARAM);
  });

  it("rejects since > end", async () => {
    const r = await tradeHistory(
      { pair: "btc_jpy", since: "2000", end: "1000" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.exitCode).toBe(EXIT.PARAM);
      expect(r.error).toContain("since must be ≤ end");
    }
  });

  it("rejects unknown order value", async () => {
    const r = await tradeHistory(
      { pair: "btc_jpy", order: "ascending" as "asc" },
      { fetch: failFetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.exitCode).toBe(EXIT.PARAM);
  });

  it("passes validated params through to URL", async () => {
    const cap = mockFetchDataCapture(MOCK);
    const r = await tradeHistory(
      { pair: "btc_jpy", count: "10", order: "asc", since: "1000", end: "2000" },
      { fetch: cap.fetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(r.success).toBe(true);
    expect(cap.urls).toHaveLength(1);
    const url = cap.urls[0];
    expect(url).toContain("/user/spot/trade_history");
    expect(url).toContain("pair=btc_jpy");
    expect(url).toContain("count=10");
    expect(url).toContain("order=asc");
    expect(url).toContain("since=1000");
    expect(url).toContain("end=2000");
  });
});

describe("tradeHistoryDispatch", () => {
  it("delegates to tradeHistoryAll when --all is set", async () => {
    const result = await tradeHistoryDispatch({
      pair: "btc_jpy",
      all: true,
      since: "1000",
      end: "2000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([{ pair: "btc_jpy", marker: "all" }]);
    }
  });

  it("propagates errors from tradeHistoryAll", async () => {
    const result = await tradeHistoryDispatch({ pair: undefined, all: true });
    expect(result.success).toBe(false);
  });

  it("delegates to single-page tradeHistory when --all is not set", async () => {
    vi.mocked(tradeHistoryAll).mockClear();
    const result = await tradeHistoryDispatch({ pair: undefined, all: false });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeTruthy();
    expect(vi.mocked(tradeHistoryAll)).not.toHaveBeenCalled();
  });
});
