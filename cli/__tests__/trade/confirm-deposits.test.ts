import { describe, expect, it, vi } from "vitest";
import { confirmDeposits } from "../../commands/trade/confirm-deposits.js";
import { TEST_CREDS, mockFetchRaw } from "../test-helpers.js";

describe("confirm-deposits", () => {
  it("returns dryRun without --execute", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const result = await confirmDeposits({ id: "12345" });
    expect(result).toMatchObject({ success: true, data: { dryRun: true } });
    expect(writeSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
  });

  it("calls API with --execute and --confirm", async () => {
    const result = await confirmDeposits(
      { id: "12345", execute: true, confirm: "I-UNDERSTAND-CONFIRM-DEPOSITS" },
      {
        fetch: mockFetchRaw({ success: 1, data: { uuid: "abc", status: "CONFIRMED" } }),
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "1",
      },
    );
    expect(result.success).toBe(true);
  });

  it("rejects --execute without --confirm (no API call)", async () => {
    const fetchSpy = vi.fn(
      async () => new Response('{"success":1,"data":{"uuid":"x","status":"ok"}}'),
    );
    const result = await confirmDeposits(
      { id: "12345", execute: true },
      { fetch: fetchSpy, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("I-UNDERSTAND-CONFIRM-DEPOSITS");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects --execute with wrong --confirm phrase", async () => {
    const fetchSpy = vi.fn(
      async () => new Response('{"success":1,"data":{"uuid":"x","status":"ok"}}'),
    );
    const result = await confirmDeposits(
      { id: "12345", execute: true, confirm: "I-UNDERSTAND-CONFIRM-DEPOSITS-ALL" },
      { fetch: fetchSpy, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("I-UNDERSTAND-CONFIRM-DEPOSITS");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("requires id", async () => {
    const result = await confirmDeposits({});
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("id is required");
  });

  it("rejects empty id", async () => {
    const result = await confirmDeposits({ id: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("id is required");
  });

  it("rejects non-numeric id", async () => {
    const result = await confirmDeposits({ id: "abc" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("positive integer");
  });

  it("rejects id=0", async () => {
    const result = await confirmDeposits({ id: "0" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("positive integer");
  });
});
