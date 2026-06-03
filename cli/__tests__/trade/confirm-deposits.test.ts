import { describe, expect, it, vi } from "vitest";
import { confirmDeposits } from "../../commands/trade/confirm-deposits.js";
import { TEST_CREDS } from "../test-helpers.js";

const DEP = "11111111-2222-3333-4444-555555555555";
const ORIG = "99999999-8888-7777-6666-555555555555";
const DEPOSITS = `${DEP}:${ORIG}`;

// POST body をキャプチャする fetch mock。実 API 形状（deposits[]）の検証用。
// 空 data {} を成功として扱えることもここで担保する（silent success 解消）。
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

describe("confirm-deposits", () => {
  it("returns dryRun without --execute", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const result = await confirmDeposits({ deposits: DEPOSITS });
    expect(result).toMatchObject({ success: true, data: { dryRun: true } });
    expect(writeSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
  });

  it("treats empty data {} as success and sends deposits[] body", async () => {
    const { fetch, calls } = captureFetch({ success: 1, data: {} });
    const result = await confirmDeposits(
      { deposits: DEPOSITS, execute: true, confirm: "I-UNDERSTAND-CONFIRM-DEPOSITS" },
      { fetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/user/confirm_deposits");
    // 送信ボディが実 API 仕様（deposits: [{ uuid, originator_uuid }]）であること。
    expect(calls[0].body).toEqual({ deposits: [{ uuid: DEP, originator_uuid: ORIG }] });
  });

  it("accepts multiple comma-separated deposit pairs", async () => {
    const { fetch, calls } = captureFetch();
    const result = await confirmDeposits(
      {
        deposits: `${DEP}:${ORIG},${ORIG}:${DEP}`,
        execute: true,
        confirm: "I-UNDERSTAND-CONFIRM-DEPOSITS",
      },
      { fetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(true);
    expect(calls[0].body).toEqual({
      deposits: [
        { uuid: DEP, originator_uuid: ORIG },
        { uuid: ORIG, originator_uuid: DEP },
      ],
    });
  });

  it("rejects --execute without --confirm (no API call)", async () => {
    const { fetch, calls } = captureFetch();
    const result = await confirmDeposits(
      { deposits: DEPOSITS, execute: true },
      { fetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("I-UNDERSTAND-CONFIRM-DEPOSITS");
    expect(calls).toHaveLength(0);
  });

  it("rejects --execute with wrong --confirm phrase", async () => {
    const { fetch, calls } = captureFetch();
    const result = await confirmDeposits(
      { deposits: DEPOSITS, execute: true, confirm: "I-UNDERSTAND-CONFIRM-DEPOSITS-ALL" },
      { fetch, retries: 0, credentials: TEST_CREDS, nonce: "1" },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("I-UNDERSTAND-CONFIRM-DEPOSITS");
    expect(calls).toHaveLength(0);
  });

  it("requires deposits (no API call)", async () => {
    const { fetch, calls } = captureFetch();
    const result = await confirmDeposits({}, { fetch, retries: 0 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("deposits is required");
    expect(calls).toHaveLength(0);
  });

  it("rejects empty deposits string (no API call)", async () => {
    const { fetch, calls } = captureFetch();
    const result = await confirmDeposits({ deposits: "" }, { fetch, retries: 0 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("deposits is required");
    expect(calls).toHaveLength(0);
  });

  it("rejects a pair missing the originator-uuid (no API call)", async () => {
    const { fetch, calls } = captureFetch();
    const result = await confirmDeposits({ deposits: DEP }, { fetch, retries: 0 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("valid UUIDs");
    expect(calls).toHaveLength(0);
  });

  it("rejects non-UUID values (no API call)", async () => {
    const { fetch, calls } = captureFetch();
    const result = await confirmDeposits({ deposits: "123:456" }, { fetch, retries: 0 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("valid UUIDs");
    expect(calls).toHaveLength(0);
  });
});
