import { describe, expect, it } from "vitest";
import { marginStatus } from "../../commands/private/margin-status.js";
import {
  marginStatusFixture,
  marginStatusNoPositionFixture,
} from "../__fixtures__/private/margin-status.js";
import { mockFetchData, mockFetchRaw, TEST_CREDS } from "../test-helpers.js";

// モックは実 API 準拠: 形状は __fixtures__/private/margin-status.ts に集約する
// （インライン即席モック禁止 / docs/dev/conventions.md「private モックの実 API 準拠」参照）。
const MOCK = marginStatusFixture;

describe("marginStatus", () => {
  it("returns margin status", async () => {
    const result = await marginStatus({
      fetch: mockFetchData(MOCK),
      retries: 0,
      credentials: TEST_CREDS,
      nonce: "1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // status は文字列のまま通る
      expect(result.data.status).toBe("NORMAL");
      // 文字列 → number 変換
      expect(result.data.total_margin_balance).toBe(1000000);
      expect(typeof result.data.total_margin_balance).toBe("number");
      expect(result.data.margin_position_profit_loss).toBe(500);
      expect(result.data.buy_credit).toBe(900000);
      // 追加された建玉サイズ・維持証拠金フィールド（文字列 → number）
      expect(result.data.unrealized_cost).toBe(12345);
      expect(result.data.total_margin_position_product).toBe(150000);
      expect(result.data.total_position_maintenance_margin).toBe(15000);
      expect(result.data.total_long_open_order_maintenance_margin).toBe(6000);
      // ペア別利用可能残高もネスト内で number 変換される
      expect(result.data.available_balances).toEqual([
        { pair: "btc_jpy", long: 900000, short: 800000 },
      ]);
    }
  });

  it("accepts null for nullable percentage fields (no positions)", async () => {
    const result = await marginStatus({
      fetch: mockFetchData(marginStatusNoPositionFixture),
      retries: 0,
      credentials: TEST_CREDS,
      nonce: "1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.total_margin_balance_percentage).toBe(null);
      expect(result.data.margin_call_percentage).toBe(null);
      expect(result.data.losscut_percentage).toBe(null);
    }
  });

  it("propagates API error", async () => {
    const result = await marginStatus({
      fetch: mockFetchRaw({ success: 0, data: { code: 70001 } }),
      retries: 0,
      credentials: TEST_CREDS,
      nonce: "1",
    });
    expect(result.success).toBe(false);
  });

  it("returns error on invalid response shape", async () => {
    const result = await marginStatus({
      fetch: mockFetchData("invalid"),
      retries: 0,
      credentials: TEST_CREDS,
      nonce: "1",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Invalid response");
  });
});
