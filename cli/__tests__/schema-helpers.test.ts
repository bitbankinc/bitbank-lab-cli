import { describe, expect, it } from "vitest";
import { nullableNumStr, numStr, safeId } from "../schema-helpers.js";

describe("numStr", () => {
  it("rejects empty string", () => {
    const result = numStr.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects non-numeric string", () => {
    const result = numStr.safeParse("abc");
    expect(result.success).toBe(false);
  });

  it("rejects Infinity", () => {
    const result = numStr.safeParse("Infinity");
    expect(result.success).toBe(false);
  });

  it("rejects -Infinity", () => {
    const result = numStr.safeParse("-Infinity");
    expect(result.success).toBe(false);
  });

  it("rejects NaN string", () => {
    const result = numStr.safeParse("NaN");
    expect(result.success).toBe(false);
  });

  it("accepts decimal string", () => {
    const result = numStr.safeParse("1234.5");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(1234.5);
  });

  it("accepts negative number string", () => {
    const result = numStr.safeParse("-123");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(-123);
  });

  it("accepts scientific notation", () => {
    const result = numStr.safeParse("1e10");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(10_000_000_000);
  });

  it("accepts zero string", () => {
    const result = numStr.safeParse("0");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(0);
  });

  it("rejects non-string input", () => {
    const result = numStr.safeParse(123);
    expect(result.success).toBe(false);
  });
});

describe("nullableNumStr", () => {
  it("accepts null", () => {
    const result = nullableNumStr.safeParse(null);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeNull();
  });

  it("rejects empty string", () => {
    const result = nullableNumStr.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects non-numeric string", () => {
    const result = nullableNumStr.safeParse("abc");
    expect(result.success).toBe(false);
  });

  it("rejects Infinity", () => {
    const result = nullableNumStr.safeParse("Infinity");
    expect(result.success).toBe(false);
  });

  it("accepts decimal string", () => {
    const result = nullableNumStr.safeParse("1234.5");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(1234.5);
  });

  it("accepts negative number string", () => {
    const result = nullableNumStr.safeParse("-123");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(-123);
  });

  it("accepts scientific notation", () => {
    const result = nullableNumStr.safeParse("1e10");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(10_000_000_000);
  });
});

describe("safeId", () => {
  it("accepts a 10-digit safe integer (typical transaction_id)", () => {
    const result = safeId.safeParse(1230957746);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(1230957746);
  });

  it("accepts MAX_SAFE_INTEGER (upper boundary)", () => {
    const result = safeId.safeParse(Number.MAX_SAFE_INTEGER);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("rejects 2 ** 53 loudly (>= 2^53, precision may be lost)", () => {
    const result = safeId.safeParse(2 ** 53);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain("safe integer");
  });

  it("rejects a value beyond 2^53", () => {
    const result = safeId.safeParse(2 ** 53 + 2);
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer", () => {
    const result = safeId.safeParse(1.5);
    expect(result.success).toBe(false);
  });

  it("rejects a string id (number-only by design; union not used)", () => {
    const result = safeId.safeParse("1230957746");
    expect(result.success).toBe(false);
  });

  it("rejects NaN and Infinity", () => {
    expect(safeId.safeParse(Number.NaN).success).toBe(false);
    expect(safeId.safeParse(Number.POSITIVE_INFINITY).success).toBe(false);
  });
});
