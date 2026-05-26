import { describe, expect, it, vi } from "vitest";
import { confirmDepositsAll } from "../../commands/trade/confirm-deposits-all.js";
import { TEST_CREDS, mockFetchRaw } from "../test-helpers.js";

describe("confirm-deposits-all", () => {
  it("returns dryRun without --execute", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const result = await confirmDepositsAll({});
    expect(result).toEqual({ success: true, data: { dryRun: true } });
    writeSpy.mockRestore();
  });

  it("calls API with --execute and --confirm", async () => {
    const result = await confirmDepositsAll(
      { execute: true, confirm: "I-UNDERSTAND-CONFIRM-DEPOSITS-ALL" },
      {
        fetch: mockFetchRaw({ success: 1, data: { status: "CONFIRMED" } }),
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "1",
      },
    );
    expect(result.success).toBe(true);
  });

  it("rejects --execute without --confirm (no API call)", async () => {
    const fetchSpy = vi.fn(async () => new Response('{"success":1,"data":{"status":"ok"}}'));
    const result = await confirmDepositsAll(
      { execute: true },
      { fetch: fetchSpy, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("I-UNDERSTAND-CONFIRM-DEPOSITS-ALL");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects --execute with wrong --confirm phrase", async () => {
    const fetchSpy = vi.fn(async () => new Response('{"success":1,"data":{"status":"ok"}}'));
    const result = await confirmDepositsAll(
      { execute: true, confirm: "I-UNDERSTAND-CONFIRM-DEPOSITS" },
      { fetch: fetchSpy, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("I-UNDERSTAND-CONFIRM-DEPOSITS-ALL");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
