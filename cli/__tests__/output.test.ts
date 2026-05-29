import { beforeEach, describe, expect, it, vi } from "vitest";
import { output } from "../output.js";

describe("output", () => {
  let stdout: string;
  let stderr: string;

  beforeEach(() => {
    stdout = "";
    stderr = "";
    vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      stdout += s;
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((s) => {
      stderr += s;
      return true;
    });
    process.exitCode = undefined;
  });

  it("outputs JSON envelope by default (non-raw)", () => {
    output({ success: true, data: { a: 1 } }, "json");
    expect(JSON.parse(stdout)).toEqual({ success: true, data: { a: 1 } });
  });

  it("includes meta in the default JSON envelope", () => {
    output(
      { success: true, data: [1, 2], meta: { rateLimit: { remaining: 5, limit: 10, reset: 1 } } },
      "json",
    );
    const parsed = JSON.parse(stdout);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual([1, 2]);
    expect(parsed.meta.rateLimit).toEqual({ remaining: 5, limit: 10, reset: 1 });
  });

  it("includes partial in the default JSON envelope", () => {
    output({ success: true, data: [1], partial: true }, "json");
    const parsed = JSON.parse(stdout);
    expect(parsed.partial).toBe(true);
    expect(parsed.data).toEqual([1]);
  });

  it("omits meta/partial keys from the envelope when absent", () => {
    output({ success: true, data: { a: 1 } }, "json");
    const parsed = JSON.parse(stdout);
    expect("meta" in parsed).toBe(false);
    expect("partial" in parsed).toBe(false);
  });

  it("outputs bare data (no envelope) when raw=true", () => {
    output({ success: true, data: { a: 1 }, meta: { returnedRows: 1 } }, "json", true);
    expect(JSON.parse(stdout)).toEqual({ a: 1 });
  });

  it("outputs table format", () => {
    output({ success: true, data: { sell: 100, buy: 99 } }, "table");
    expect(stdout).toContain("sell");
    expect(stdout).toContain("100");
  });

  it("outputs CSV format", () => {
    output({ success: true, data: { sell: 100, buy: 99 } }, "csv");
    const lines = stdout.trim().split("\n");
    expect(lines[0]).toBe("sell,buy");
    expect(lines[1]).toBe("100,99");
  });

  it("escapes CSV fields containing commas", () => {
    output({ success: true, data: { name: "a,b", value: 1 } }, "csv");
    const lines = stdout.trim().split("\n");
    expect(lines[1]).toBe('"a,b",1');
  });

  it("escapes CSV fields containing double quotes", () => {
    output({ success: true, data: { name: 'say "hi"', value: 2 } }, "csv");
    const lines = stdout.trim().split("\n");
    expect(lines[1]).toBe('"say ""hi""",2');
  });

  it.each([
    ["=SUM(A1)", '"=SUM(A1)"'],
    ["+1+1", '"+1+1"'],
    ["-2", '"-2"'],
    ["@cmd", '"@cmd"'],
    ["\tleading-tab", '"\tleading-tab"'],
    ["\rleading-cr", '"\rleading-cr"'],
  ])("quotes CSV fields starting with formula prefix %j", (input, expected) => {
    output({ success: true, data: { name: input, value: 1 } }, "csv");
    const lines = stdout.trim().split("\n");
    expect(lines[1].split(",")[0]).toBe(expected);
  });

  it("does not quote plain values starting with safe characters", () => {
    output({ success: true, data: { name: "hello", value: 1 } }, "csv");
    const lines = stdout.trim().split("\n");
    expect(lines[1]).toBe("hello,1");
  });

  it("escapes CSV fields containing newlines", () => {
    output({ success: true, data: { name: "line1\nline2", value: 3 } }, "csv");
    const lines = stdout.split("\n");
    // header + quoted field spans line, so raw split produces more lines
    expect(stdout).toContain('"line1\nline2"');
  });

  it("outputs compact JSON when raw=true", () => {
    output({ success: true, data: { a: 1, b: 2 } }, "json", true);
    expect(stdout).toBe('{"a":1,"b":2}\n');
  });

  it("outputs pretty JSON when raw=false", () => {
    output({ success: true, data: { a: 1 } }, "json", false);
    expect(stdout).toContain("\n  ");
  });

  it("outputs error to stderr", () => {
    output({ success: false, error: "fail" }, "json");
    expect(stderr).toContain("fail");
    expect(process.exitCode).toBe(1);
  });

  it("warns on stderr when result.partial is true", () => {
    output({ success: true, data: [1], partial: true }, "json");
    expect(stderr).toContain("Warning: partial data returned");
  });

  it("warns on stderr with reason when result.meta.truncated is true", () => {
    output(
      {
        success: true,
        data: [1],
        partial: true,
        meta: { truncated: true, reason: "MAX_RANGE_FETCHES" },
      },
      "json",
    );
    expect(stderr).toContain("Warning: truncated data returned");
    expect(stderr).toContain("MAX_RANGE_FETCHES");
    expect(stderr).not.toContain("partial data returned");
  });

  it("renders the human DRY RUN box for dry-run data instead of JSON (default json)", () => {
    output(
      {
        success: true,
        data: {
          dryRun: true,
          endpoint: "/v1/user/spot/order",
          body: { pair: "btc_jpy" },
          executeHint: "run --execute",
          confirmPhrase: "I-UNDERSTAND-CREATE-ORDER",
        },
      },
      "json",
    );
    expect(stdout).toContain("🔍 DRY RUN");
    expect(stdout).toContain("POST /v1/user/spot/order");
    // The human box is intentionally not JSON (back-compat).
    expect(() => JSON.parse(stdout)).toThrow();
  });

  it("renders the DRY RUN box regardless of the human format (table)", () => {
    output(
      {
        success: true,
        data: { dryRun: true, endpoint: "/x", body: {}, executeHint: "run --execute" },
      },
      "table",
    );
    expect(stdout).toContain("DRY RUN");
  });
});
