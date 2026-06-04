import { describe, expect, it } from "vitest";
import { depositOriginators } from "../../commands/private/deposit-originators.js";
import { depositOriginatorsFixture } from "../__fixtures__/private/deposit-originators.js";
import { mockFetchData, mockFetchRaw, TEST_CREDS } from "../test-helpers.js";

// モックは実 API 準拠: 形状は __fixtures__/private/deposit-originators.ts に集約する
// （インライン即席モック禁止 / docs/dev/conventions.md「private モックの実 API 準拠」参照）。
const MOCK = depositOriginatorsFixture;

describe("depositOriginators", () => {
  it("returns originators (null fields pass)", async () => {
    const result = await depositOriginators({
      fetch: mockFetchData(MOCK),
      retries: 0,
      credentials: TEST_CREDS,
      nonce: "1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      const o = result.data[0];
      // 架空フィールド address / asset / network は持たない。実 API の構造を保持する。
      expect(o.uuid).toBe("11111111-2222-3333-4444-555555555555");
      expect(o.deposit_type).toBe("self");
      expect(o.originator_status).toBe("approved");
      // nullable フィールドが null のまま通る
      expect(o.deposit_purpose).toBe(null);
      expect(o.originator_last_name).toBe(null);
      expect(o.originator_building).toBe(null);
      // ネストした substantial controllers（prefecture は null あり）
      expect(o.originator_substantial_controllers).toEqual([
        {
          uuid: "99999999-8888-7777-6666-555555555555",
          name: "Taro Yamada",
          country: "JP",
          prefecture: null,
        },
      ]);
    }
  });

  it("propagates API error", async () => {
    const result = await depositOriginators({
      fetch: mockFetchRaw({ success: 0, data: { code: 70001 } }),
      retries: 0,
      credentials: TEST_CREDS,
      nonce: "1",
    });
    expect(result.success).toBe(false);
  });

  it("returns error on invalid response shape", async () => {
    const result = await depositOriginators({
      fetch: mockFetchData("invalid"),
      retries: 0,
      credentials: TEST_CREDS,
      nonce: "1",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Invalid response");
  });
});
