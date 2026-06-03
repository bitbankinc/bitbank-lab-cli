import { describe, expect, it, vi } from "vitest";
import { confirmDepositsAll } from "../../commands/trade/confirm-deposits-all.js";
import { TEST_CREDS } from "../test-helpers.js";

const ORIG = "99999999-8888-7777-6666-555555555555";

// POST body をキャプチャする fetch mock。実 API 形状（originator_uuid）の検証用。
function captureFetch(body: unknown = { success: 1, data: {} }) {
  const calls: { url: string; body: unknown }[] = [];
  const fetch = (async (input: unknown, init?: { body?: string }) => {
    calls.push({
      url: String(input),
      body: init?.body ? JSON.parse(init.body) : undefined,
    });
    return new Response(JSON.stringify(body));
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

describe("confirm-deposits-all", () => {
  it("returns dryRun without --execute", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const result = await confirmDepositsAll({ originatorUuid: ORIG });
    expect(result).toMatchObject({ success: true, data: { dryRun: true } });
    expect(writeSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
  });

  it("treats empty data {} as success and sends originator_uuid body", async () => {
    const { fetch, calls } = captureFetch({ success: 1, data: {} });
    const result = await confirmDepositsAll(
      { originatorUuid: ORIG, execute: true, confirm: "I-UNDERSTAND-CONFIRM-DEPOSITS-ALL" },
      { fetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/user/confirm_deposits_all");
    expect(calls[0].body).toEqual({ originator_uuid: ORIG });
  });

  it("rejects --execute without --confirm (no API call)", async () => {
    const { fetch, calls } = captureFetch();
    const result = await confirmDepositsAll(
      { originatorUuid: ORIG, execute: true },
      { fetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("I-UNDERSTAND-CONFIRM-DEPOSITS-ALL");
    expect(calls).toHaveLength(0);
  });

  it("rejects --execute with wrong --confirm phrase", async () => {
    const { fetch, calls } = captureFetch();
    const result = await confirmDepositsAll(
      { originatorUuid: ORIG, execute: true, confirm: "I-UNDERSTAND-CONFIRM-DEPOSITS" },
      { fetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("I-UNDERSTAND-CONFIRM-DEPOSITS-ALL");
    expect(calls).toHaveLength(0);
  });

  it("requires originator-uuid (no API call)", async () => {
    const { fetch, calls } = captureFetch();
    const result = await confirmDepositsAll({}, { fetch, retries: 0 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("originator-uuid is required");
    expect(calls).toHaveLength(0);
  });

  it("rejects a non-UUID originator-uuid (no API call)", async () => {
    const { fetch, calls } = captureFetch();
    const result = await confirmDepositsAll(
      { originatorUuid: "not-a-uuid" },
      { fetch, retries: 0 },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("uuid");
    expect(calls).toHaveLength(0);
  });
});
