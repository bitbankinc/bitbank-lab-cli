import { describe, expect, it } from "vitest";
import { parseChannelData } from "../../../commands/stream/channel-parsers/index.js";

describe("parseChannelData: ticker_<pair>", () => {
  it("coerces all numeric ticker fields to number", () => {
    const raw = {
      sell: "100.5",
      buy: "100.4",
      high: "101",
      low: "99",
      open: "100",
      last: "100.5",
      vol: "1.25",
      timestamp: 1700000000000,
    };
    const r = parseChannelData("ticker_btc_jpy", raw);
    expect(r.warning).toBeUndefined();
    expect(r.data).toMatchObject({ last: 100.5, vol: 1.25, sell: 100.5, buy: 100.4 });
  });

  it("preserves unknown extra fields via passthrough", () => {
    const raw = {
      sell: "1",
      buy: "1",
      high: "1",
      low: "1",
      open: "1",
      last: "1",
      vol: "1",
      timestamp: 0,
      newField: "future-extension",
    };
    const r = parseChannelData("ticker_btc_jpy", raw);
    expect(r.warning).toBeUndefined();
    expect((r.data as Record<string, unknown>).newField).toBe("future-extension");
  });

  it("falls back to raw with warning when ticker payload is malformed", () => {
    const raw = { sell: "garbage", last: null };
    const r = parseChannelData("ticker_btc_jpy", raw);
    expect(r.warning).toContain("Schema mismatch");
    expect(r.data).toBe(raw);
  });
});

describe("parseChannelData: transactions_<pair>", () => {
  it("coerces price/amount to number for each transaction", () => {
    const raw = {
      transactions: [
        {
          transaction_id: 1,
          side: "buy",
          price: "15580000",
          amount: "0.05",
          executed_at: 1700000000000,
        },
      ],
    };
    const r = parseChannelData("transactions_btc_jpy", raw);
    expect(r.warning).toBeUndefined();
    expect(
      (r.data as { transactions: Array<{ price: number; amount: number }> }).transactions[0],
    ).toMatchObject({ price: 15580000, amount: 0.05 });
  });

  it("falls back to raw when transaction is malformed", () => {
    const raw = { transactions: [{ price: "x", amount: "y" }] };
    const r = parseChannelData("transactions_btc_jpy", raw);
    expect(r.warning).toContain("Schema mismatch");
    expect(r.data).toBe(raw);
  });
});

describe("parseChannelData: depth_diff_<pair> / depth_whole_<pair>", () => {
  it("coerces asks/bids tuples to number for depth_diff", () => {
    const raw = {
      asks: [["100", "0.5"]],
      bids: [["99", "1.2"]],
      timestamp: 1700000000000,
    };
    const r = parseChannelData("depth_diff_btc_jpy", raw);
    expect(r.warning).toBeUndefined();
    expect((r.data as { asks: number[][]; bids: number[][] }).asks).toEqual([[100, 0.5]]);
    expect((r.data as { asks: number[][]; bids: number[][] }).bids).toEqual([[99, 1.2]]);
  });

  it("accepts depth_diff with only asks (one-sided update)", () => {
    const raw = { asks: [["100", "0.5"]] };
    const r = parseChannelData("depth_diff_btc_jpy", raw);
    expect(r.warning).toBeUndefined();
    expect((r.data as { asks: number[][] }).asks).toEqual([[100, 0.5]]);
  });

  it("uses same schema for depth_whole", () => {
    const raw = { asks: [["100", "0.5"]], bids: [["99", "1.2"]] };
    const r = parseChannelData("depth_whole_btc_jpy", raw);
    expect(r.warning).toBeUndefined();
  });
});

describe("parseChannelData: circuit_break_info_<pair>", () => {
  it("accepts mode-only payload", () => {
    const r = parseChannelData("circuit_break_info_btc_jpy", { mode: "NONE" });
    expect(r.warning).toBeUndefined();
    expect((r.data as { mode: string }).mode).toBe("NONE");
  });

  it("coerces estimated_itayose_price when present", () => {
    const r = parseChannelData("circuit_break_info_btc_jpy", {
      mode: "WIDE",
      estimated_itayose_price: "15500000",
      estimated_itayose_amount: "0.5",
    });
    expect(r.warning).toBeUndefined();
    expect(r.data).toMatchObject({
      mode: "WIDE",
      estimated_itayose_price: 15500000,
      estimated_itayose_amount: 0.5,
    });
  });
});

describe("parseChannelData: unknown channel", () => {
  it("returns raw with warning when channel prefix is not registered", () => {
    const raw = { foo: "bar" };
    const r = parseChannelData("mystery_btc_jpy", raw);
    expect(r.warning).toContain("Unknown channel");
    expect(r.data).toBe(raw);
  });
});
