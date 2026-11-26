import { describe, expect, it } from "vitest";
import { z } from "zod";
import { formatZodError, requiredString } from "../validators.js";
import "../zod-messages.js";

// 期待値は zod@3.25.76 の既定 error map が実際に出した文言（v3 → v4 移行時に同じ入力で採取）。
// CLI の引数エラー（formatZodError）としてユーザーに見えるので、v4 の既定文言に戻さない。
function messageOf(schema: z.ZodType, input: unknown): string {
  const r = schema.safeParse(input);
  return r.success ? "OK" : formatZodError(r.error);
}

describe("zod-messages: Zod 3 互換の既定文言", () => {
  it.each([
    ["未指定", z.string(), undefined, "Required"],
    ["型違い", z.string(), true, "Expected string, received boolean"],
    ["NaN", z.number(), Number.NaN, "Expected number, received nan"],
    [
      "enum 不一致",
      z.enum(["day", "month"]),
      "week",
      "Invalid enum value. Expected 'day' | 'month', received 'week'",
    ],
    ["enum 未指定", z.enum(["buy", "sell"]), undefined, "Required"],
    ["enum 型違い", z.enum(["a", "b"]), 1, "Expected 'a' | 'b', received number"],
    ["literal", z.literal("x"), "y", 'Invalid literal value, expected "x"'],
    ["string min", z.string().min(3), "a", "String must contain at least 3 character(s)"],
    ["string length", z.string().length(2), "abc", "String must contain exactly 2 character(s)"],
    ["number min", z.number().min(1), 0, "Number must be greater than or equal to 1"],
    ["positive", z.number().positive(), 0, "Number must be greater than 0"],
    ["number max", z.number().max(5), 6, "Number must be less than or equal to 5"],
    ["int", z.number().int(), 1.5, "Expected integer, received float"],
    ["array min", z.array(z.string()).min(1), [], "Array must contain at least 1 element(s)"],
    ["regex", z.string().regex(/^x$/), "y", "Invalid"],
    ["datetime", z.iso.datetime(), "x", "Invalid datetime"],
    [
      "strict",
      z.strictObject({ a: z.string() }),
      { a: "", b: 1 },
      "Unrecognized key(s) in object: 'b'",
    ],
  ])("%s", (_label, schema, input, expected) => {
    expect(messageOf(schema, input)).toBe(expected);
  });

  it("discriminatedUnion の不一致は候補を列挙する", () => {
    const s = z.discriminatedUnion("v", [
      z.object({ v: z.literal(1) }),
      z.object({ v: z.literal(2) }),
    ]);
    expect(messageOf(s, { v: 3 })).toBe("Invalid discriminator value. Expected 1 | 2");
  });

  it("schema 側で指定した文言が優先される", () => {
    expect(messageOf(z.string().min(3, "too short"), "a")).toBe("too short");
    expect(messageOf(z.enum(["a"], { error: "pick a" }), "b")).toBe("pick a");
  });

  it("複数 issue は path 順に '; ' で連結される", () => {
    const s = z.object({ side: z.enum(["buy", "sell"]), type: z.enum(["market"]) });
    expect(messageOf(s, {})).toBe("Required; Required");
  });
});

describe("requiredString（v3 の required_error 相当）", () => {
  const s = requiredString("pair is required").min(1, "empty");

  it("未指定のときだけ指定の文言を出す", () => {
    expect(messageOf(s, undefined)).toBe("pair is required");
  });

  it("型違いは既定文言、checks は各自の文言のまま", () => {
    expect(messageOf(s, 1)).toBe("Expected string, received number");
    expect(messageOf(s, "")).toBe("empty");
  });
});
