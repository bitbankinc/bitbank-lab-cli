import { beforeEach, describe, expect, it, vi } from "vitest";
import { machineOutput, output } from "../output.js";

describe("machine mode", () => {
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

  describe("output with machine=true", () => {
    it("wraps success data in JSON envelope on stdout", () => {
      output({ success: true, data: { price: 100 } }, "json", false, true);
      const parsed = JSON.parse(stdout);
      expect(parsed).toEqual({ success: true, data: { price: 100 } });
      expect(stderr).toBe("");
    });

    it("includes meta.rateLimit when present", () => {
      output(
        {
          success: true,
          data: { price: 100 },
          meta: { rateLimit: { remaining: 5, limit: 10, reset: 1234 } },
        },
        "table",
        false,
        true,
      );
      const parsed = JSON.parse(stdout);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual({ price: 100 });
      expect(parsed.meta.rateLimit).toEqual({ remaining: 5, limit: 10, reset: 1234 });
    });

    it("outputs error as JSON on stdout (not stderr)", () => {
      output({ success: false, error: "not found", exitCode: 4 }, "json", false, true);
      const parsed = JSON.parse(stdout);
      expect(parsed).toEqual({ success: false, error: "not found", exitCode: 4 });
      expect(stderr).toBe("");
      expect(process.exitCode).toBe(4);
    });

    it("defaults exitCode to 1 when not specified", () => {
      output({ success: false, error: "fail" }, "json", false, true);
      const parsed = JSON.parse(stdout);
      expect(parsed.exitCode).toBe(1);
      expect(process.exitCode).toBe(1);
    });

    it("overrides format — always outputs JSON envelope", () => {
      output({ success: true, data: { a: 1 } }, "csv", false, true);
      const parsed = JSON.parse(stdout);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual({ a: 1 });
    });

    it("omits meta key when meta is undefined", () => {
      output({ success: true, data: "ok" }, "json", false, true);
      const parsed = JSON.parse(stdout);
      expect(parsed).toEqual({ success: true, data: "ok" });
      expect("meta" in parsed).toBe(false);
    });

    it("emits dry-run data as a single JSON envelope, not the human box", () => {
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
        false,
        true,
      );
      const parsed = JSON.parse(stdout);
      expect(parsed.success).toBe(true);
      expect(parsed.data.dryRun).toBe(true);
      expect(parsed.data.endpoint).toBe("/v1/user/spot/order");
      expect(stdout).not.toContain("DRY RUN");
      expect(stderr).toBe("");
    });
  });

  describe("machineOutput standalone", () => {
    it("outputs success envelope", () => {
      machineOutput({ success: true, data: [1, 2, 3] });
      const parsed = JSON.parse(stdout);
      expect(parsed).toEqual({ success: true, data: [1, 2, 3] });
    });

    it("outputs error envelope with exitCode", () => {
      machineOutput({ success: false, error: "rate limited", exitCode: 3 });
      const parsed = JSON.parse(stdout);
      expect(parsed).toEqual({ success: false, error: "rate limited", exitCode: 3 });
      expect(process.exitCode).toBe(3);
    });
  });
});
