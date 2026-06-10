import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  formatZodError,
  MSG_AMOUNT,
  MSG_ASSET,
  MSG_ID,
  MSG_ORDER_ID,
  MSG_ORDER_IDS,
  MSG_ORDER_IDS_INFO,
  MSG_PAIR,
  MSG_PAIR_CIRCUIT_BREAK,
  MSG_PAIR_DEPTH,
  MSG_PAIR_TICKER,
  MSG_PAIR_TRANSACTIONS,
  MSG_UUID,
  requireField,
} from "../validators.js";

describe("requireField", () => {
  it("returns error for undefined", () => {
    const r = requireField(undefined, MSG_PAIR);
    expect(r).toEqual({ success: false, error: MSG_PAIR });
  });

  it("returns error for null", () => {
    const r = requireField(null, MSG_ASSET);
    expect(r).toEqual({ success: false, error: MSG_ASSET });
  });

  it("returns error for empty string", () => {
    const r = requireField("", MSG_ORDER_ID);
    expect(r).toEqual({ success: false, error: MSG_ORDER_ID });
  });

  it("returns data for valid string", () => {
    const r = requireField("btc_jpy", MSG_PAIR);
    expect(r).toEqual({ success: true, data: "btc_jpy" });
  });

  it("returns data for number", () => {
    const r = requireField(42, MSG_ID);
    expect(r).toEqual({ success: true, data: 42 });
  });
});

describe("message constants", () => {
  it("option-style messages", () => {
    expect(MSG_PAIR).toBe("pair is required. Example: --pair=btc_jpy");
    expect(MSG_ASSET).toBe("asset is required. Example: --asset=btc");
    expect(MSG_ORDER_ID).toBe("order-id is required. Example: --order-id=12345");
    expect(MSG_ORDER_IDS).toBe("order-ids is required. Example: --order-ids=1,2,3");
    expect(MSG_ORDER_IDS_INFO).toBe("order-ids is required. Example: --order-ids=123,456");
    expect(MSG_UUID).toBe("uuid is required. Example: --uuid=xxx-yyy");
    expect(MSG_AMOUNT).toBe("amount is required. Example: --amount=0.5");
    expect(MSG_ID).toBe("id is required. Example: --id=12345");
  });

  it("positional-style messages", () => {
    expect(MSG_PAIR_TICKER).toBe("pair is required. Example: npx bitbank ticker btc_jpy");
    expect(MSG_PAIR_DEPTH).toBe("pair is required. Example: npx bitbank depth btc_jpy");
    expect(MSG_PAIR_TRANSACTIONS).toBe(
      "pair is required. Example: npx bitbank transactions btc_jpy",
    );
    expect(MSG_PAIR_CIRCUIT_BREAK).toBe(
      "pair is required. Example: npx bitbank circuit-break btc_jpy",
    );
  });
});

describe("formatZodError", () => {
  it("returns the single issue message", () => {
    const r = z.string().min(3, "too short").safeParse("a");
    expect(r.success).toBe(false);
    if (!r.success) expect(formatZodError(r.error)).toBe("too short");
  });

  it("joins multiple issue messages with '; '", () => {
    const schema = z.object({
      a: z.string().min(1, "a required"),
      b: z.string().min(2, "b too short"),
    });
    const r = schema.safeParse({ a: "", b: "x" });
    expect(r.success).toBe(false);
    if (!r.success) expect(formatZodError(r.error)).toBe("a required; b too short");
  });
});
