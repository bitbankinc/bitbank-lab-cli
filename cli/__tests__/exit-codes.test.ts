import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXIT } from "../exit-codes.js";
import { apiErrorExitCode } from "../http-core.js";
import { output } from "../output.js";

describe("EXIT constants", () => {
  it("defines distinct codes", () => {
    const codes = Object.values(EXIT);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("SUCCESS is 0", () => {
    expect(EXIT.SUCCESS).toBe(0);
  });
});

describe("apiErrorExitCode", () => {
  it("returns AUTH for 20001-20003", () => {
    expect(apiErrorExitCode(20001)).toBe(EXIT.AUTH);
    expect(apiErrorExitCode(20002)).toBe(EXIT.AUTH);
    expect(apiErrorExitCode(20003)).toBe(EXIT.AUTH);
  });

  it("returns RATE_LIMIT for 10009 (frequency warning)", () => {
    expect(apiErrorExitCode(10009)).toBe(EXIT.RATE_LIMIT);
  });

  it("returns GENERAL for 60001 (insufficient amount, not rate limit)", () => {
    expect(apiErrorExitCode(60001)).toBe(EXIT.GENERAL);
  });

  it("returns PARAM for 30001-40001", () => {
    expect(apiErrorExitCode(30001)).toBe(EXIT.PARAM);
    expect(apiErrorExitCode(30012)).toBe(EXIT.PARAM);
    expect(apiErrorExitCode(40001)).toBe(EXIT.PARAM);
  });

  it("returns GENERAL for unknown codes", () => {
    expect(apiErrorExitCode(10000)).toBe(EXIT.GENERAL);
    expect(apiErrorExitCode(70001)).toBe(EXIT.GENERAL);
  });
});

describe("output exitCode propagation", () => {
  beforeEach(() => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    process.exitCode = undefined;
  });

  it("uses exitCode from Result when provided", () => {
    output({ success: false, error: "auth fail", exitCode: EXIT.AUTH }, "json");
    expect(process.exitCode).toBe(EXIT.AUTH);
  });

  it("defaults to 1 when exitCode is not provided", () => {
    output({ success: false, error: "unknown" }, "json");
    expect(process.exitCode).toBe(1);
  });

  it("uses RATE_LIMIT code", () => {
    output({ success: false, error: "rate limited", exitCode: EXIT.RATE_LIMIT }, "json");
    expect(process.exitCode).toBe(EXIT.RATE_LIMIT);
  });
});
