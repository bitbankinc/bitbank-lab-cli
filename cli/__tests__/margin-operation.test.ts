import { describe, expect, it } from "vitest";
import { EXIT } from "../exit-codes.js";
import {
  checkMarginIntent,
  MarginIntentSchema,
  marginOperation,
  PositionSideSchema,
} from "../margin-operation.js";

describe("marginOperation: side × position_side → label / intent", () => {
  it.each([
    ["buy", "long", "ロング新規建て（buy × long）", "open"],
    ["sell", "long", "ロング返済（sell × long）", "close"],
    ["sell", "short", "ショート新規建て（sell × short）", "open"],
    ["buy", "short", "ショート返済（buy × short）", "close"],
  ] as const)("%s × %s → %s", (side, positionSide, label, intent) => {
    expect(marginOperation(side, positionSide)).toEqual({ label, intent });
  });
});

describe("checkMarginIntent: --intent cross-check", () => {
  it("passes when --intent is omitted (it is optional)", () => {
    const r = checkMarginIntent("sell", "long");
    expect(r).toEqual({
      success: true,
      data: { label: "ロング返済（sell × long）", intent: "close" },
    });
  });

  it.each([
    ["buy", "long", "open"],
    ["sell", "long", "close"],
    ["sell", "short", "open"],
    ["buy", "short", "close"],
  ] as const)("passes when %s × %s matches --intent=%s", (side, positionSide, intent) => {
    expect(checkMarginIntent(side, positionSide, intent).success).toBe(true);
  });

  it.each([
    ["buy", "long", "close", "--side=sell"],
    ["sell", "long", "open", "--side=buy"],
    ["sell", "short", "close", "--side=buy"],
    ["buy", "short", "open", "--side=sell"],
  ] as const)("rejects %s × %s with --intent=%s and points to %s", (side, positionSide, intent, hint) => {
    const r = checkMarginIntent(side, positionSide, intent);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.exitCode).toBe(EXIT.PARAM);
      expect(r.error).toContain(`--intent=${intent}`);
      expect(r.error).toContain(hint);
    }
  });

  it("names both the actual and the intended operation in the error", () => {
    const r = checkMarginIntent("buy", "long", "close");
    if (r.success) throw new Error("expected failure");
    expect(r.error).toBe(
      "--intent=close と注文の向きが食い違っています: buy × long は ロング新規建て（open）です。" +
        "ロング返済なら --side=sell を指定してください",
    );
  });
});

describe("schemas", () => {
  it("accept only the API vocabulary", () => {
    expect(PositionSideSchema.safeParse("long").success).toBe(true);
    expect(PositionSideSchema.safeParse("buy").success).toBe(false);
    expect(MarginIntentSchema.safeParse("close").success).toBe(true);
    expect(MarginIntentSchema.safeParse("exit").success).toBe(false);
  });
});
