import { describe, expect, it } from "vitest";
import { marginPositions } from "../../commands/private/margin-positions.js";
import { TEST_CREDS, mockFetchData, mockFetchRaw } from "../test-helpers.js";

const MOCK = {
  notice: { what: "", occurred_at: 0, amount: "0", due_date_at: 0 },
  payables: { amount: "0" },
  positions: [
    {
      pair: "btc_jpy",
      position_side: "long",
      open_amount: "0.01",
      product: "150000",
      average_price: "15000000",
      unrealized_fee_amount: "0.5",
      unrealized_interest_amount: "1.2",
    },
  ],
  losscut_threshold: { btc_jpy: "0" },
};

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
      expect(result.data).toHaveLength(1);
      const pos = result.data[0];
      expect(pos.pair).toBe("btc_jpy");
      expect(pos.position_side).toBe("long");
      // numStr で文字列 → number に変換されていること
      expect(pos.open_amount).toBe(0.01);
      expect(pos.product).toBe(150000);
      expect(pos.average_price).toBe(15000000);
      expect(pos.unrealized_fee_amount).toBe(0.5);
      expect(pos.unrealized_interest_amount).toBe(1.2);
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
