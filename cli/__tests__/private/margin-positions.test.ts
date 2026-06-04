import { describe, expect, it } from "vitest";
import { marginPositions } from "../../commands/private/margin-positions.js";
import { marginPositionsFixture } from "../__fixtures__/private/margin-positions.js";
import { mockFetchData, mockFetchRaw, TEST_CREDS } from "../test-helpers.js";

// モックは実 API 準拠: 形状は __fixtures__/private/margin-positions.ts に集約する
// （インライン即席モック禁止 / docs/dev/conventions.md「private モックの実 API 準拠」参照）。
const MOCK = marginPositionsFixture;

describe("marginPositions", () => {
  it("returns margin positions", async () => {
    const result = await marginPositions(
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
      expect(result.data.positions).toHaveLength(1);
      const pos = result.data.positions[0];
      expect(pos.pair).toBe("btc_jpy");
      expect(pos.position_side).toBe("long");
      // numStr で文字列 → number に変換されていること
      expect(pos.open_amount).toBe(0.01);
      expect(pos.product).toBe(150000);
      expect(pos.average_price).toBe(15000000);
      expect(pos.unrealized_fee_amount).toBe(0.5);
      expect(pos.unrealized_interest_amount).toBe(1.2);
      // トップレベルの追加フィールド
      expect(result.data.notice).toEqual({
        what: "additional_margin",
        occurred_at: 1700000000000,
        amount: 5000,
        due_date_at: 1700600000000,
      });
      expect(result.data.payables.amount).toBe(0);
      expect(result.data.losscut_threshold).toEqual({ individual: 80, company: 60 });
    }
  });

  it("accepts a null/omitted notice (no margin event)", async () => {
    const { notice, ...withoutNotice } = MOCK;
    for (const variant of [{ ...withoutNotice }, { ...withoutNotice, notice: null }]) {
      const result = await marginPositions(
        {},
        { fetch: mockFetchData(variant), retries: 0, credentials: TEST_CREDS, nonce: "1" },
      );
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.notice ?? null).toBe(null);
    }
  });

  it("works without pair filter", async () => {
    const result = await marginPositions(
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
    const result = await marginPositions(
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
    const result = await marginPositions(
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
});
