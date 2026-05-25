import { describe, expect, it } from "vitest";
import { resolvePairInfo } from "../../watch/pair-info.js";
import { MOCK_PAIRS, mockGetPairs, mockGetPairsWith } from "../test-helpers.js";

describe("resolvePairInfo", () => {
  it("returns priceDecimals / amountDecimals from cache hit", async () => {
    const info = await resolvePairInfo("btc_jpy", mockGetPairs);
    expect(info).toEqual({ priceDecimals: 0, amountDecimals: 4 });
  });

  it("returns undefined when pair is not in cache", async () => {
    const info = await resolvePairInfo("missing_pair", mockGetPairs);
    expect(info).toBeUndefined();
  });

  it("returns undefined when getPairs fails (graceful fallback)", async () => {
    const info = await resolvePairInfo("btc_jpy", async () => ({
      success: false,
      error: "cache miss",
    }));
    expect(info).toBeUndefined();
  });

  it("reflects schema digits from cache (XRP/BTC = decimal price)", async () => {
    const info = await resolvePairInfo(
      "xrp_btc",
      mockGetPairsWith([
        {
          name: "xrp_btc",
          base_asset: "xrp",
          quote_asset: "btc",
          price_digits: 8,
          amount_digits: 0,
        },
      ]),
    );
    expect(info).toEqual({ priceDecimals: 8, amountDecimals: 0 });
  });

  it("MOCK_PAIRS contains expected digits sanity check", () => {
    expect(MOCK_PAIRS.find((p) => p.name === "btc_jpy")?.price_digits).toBe(0);
  });
});
