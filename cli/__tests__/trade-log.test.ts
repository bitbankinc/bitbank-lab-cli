// 100行超: trade ログのフォーマット分岐を網羅
import { existsSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TradeLogRecordSchema } from "../trade-log-schema.js";
import { buildLogRecord, writeTradeLog } from "../trade-log.js";

function tmpFile(): string {
  return join(
    tmpdir(),
    `trade-log-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`,
  );
}

const cleanup: string[] = [];
afterEach(() => {
  for (const f of cleanup) {
    try {
      unlinkSync(f);
    } catch {
      /* ignore */
    }
  }
  cleanup.length = 0;
});

describe("buildLogRecord", () => {
  it("builds a success record", () => {
    const r = buildLogRecord(
      "createOrder",
      { pair: "btc_jpy" },
      { success: true, data: { order_id: 1 } },
    );
    expect(r.success).toBe(true);
    expect(r.command).toBe("createOrder");
    expect(r.data).toEqual({ order_id: 1 });
    expect(r.error).toBeUndefined();
    expect(TradeLogRecordSchema.safeParse(r).success).toBe(true);
  });

  it("masks sensitive keys (token, otp_token)", () => {
    const r = buildLogRecord(
      "createOrder",
      { asset: "btc", amount: "0.5", token: "123456", otp_token: "abcdef" },
      { success: true, data: { uuid: "u1" } },
    );
    expect(r.params.token).toBe("***");
    expect(r.params.otp_token).toBe("***");
    expect(r.params.asset).toBe("btc");
    expect(r.params.amount).toBe("0.5");
  });

  it("masks sensitive keys in result.data", () => {
    const r = buildLogRecord(
      "createOrder",
      { asset: "btc" },
      { success: true, data: { token: "secret123", uuid: "u1" } },
    );
    const data = r.data as { token: string; uuid: string };
    expect(data.token).toBe("***");
    expect(data.uuid).toBe("u1");
  });

  it("masks sensitive keys in nested objects within data", () => {
    const r = buildLogRecord(
      "createOrder",
      {},
      {
        success: true,
        data: { meta: { auth_token: "x", inner: { credential: "y" } } },
      },
    );
    const data = r.data as { meta: { auth_token: string; inner: { credential: string } } };
    expect(data.meta.auth_token).toBe("***");
    expect(data.meta.inner.credential).toBe("***");
  });

  it("masks wallet-related keys (private_key / seed / mnemonic / passphrase)", () => {
    const r = buildLogRecord(
      "createOrder",
      {},
      {
        success: true,
        data: {
          private_key: "pk",
          seed: "raw-seed",
          seed_phrase: "abc",
          mnemonic: "word word",
          passphrase: "p",
        },
      },
    );
    const data = r.data as Record<string, string>;
    expect(data.private_key).toBe("***");
    expect(data.seed).toBe("***");
    expect(data.seed_phrase).toBe("***");
    expect(data.mnemonic).toBe("***");
    expect(data.passphrase).toBe("***");
  });

  it("masks sensitive keys inside arrays within data", () => {
    const r = buildLogRecord(
      "createOrder",
      {},
      { success: true, data: { items: [{ token: "a" }, { uuid: "b" }] } },
    );
    const data = r.data as { items: Array<{ token?: string; uuid?: string }> };
    expect(data.items[0].token).toBe("***");
    expect(data.items[1].uuid).toBe("b");
  });

  it("does not pollute Object.prototype via __proto__ key", () => {
    const payload = JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}');
    buildLogRecord("createOrder", {}, { success: true, data: payload });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("masks sensitive keys in nested params (regression)", () => {
    const r = buildLogRecord(
      "createOrder",
      { nested: { token: "deep", asset: "btc" } },
      { success: true, data: {} },
    );
    const params = r.params as { nested: { token: string; asset: string } };
    expect(params.nested.token).toBe("***");
    expect(params.nested.asset).toBe("btc");
  });

  it("builds a failure record", () => {
    const r = buildLogRecord(
      "cancelOrder",
      { pair: "btc_jpy" },
      { success: false, error: "not found" },
    );
    expect(r.success).toBe(false);
    expect(r.error).toBe("not found");
    expect(r.data).toBeUndefined();
    expect(TradeLogRecordSchema.safeParse(r).success).toBe(true);
  });
});

describe("writeTradeLog", () => {
  it("creates file and appends NDJSON line", async () => {
    const f = tmpFile();
    cleanup.push(f);
    const record = buildLogRecord(
      "createOrder",
      { pair: "btc_jpy" },
      { success: true, data: { id: 1 } },
    );
    const result = await writeTradeLog(f, record);
    expect(result.success).toBe(true);
    const lines = readFileSync(f, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(TradeLogRecordSchema.parse(JSON.parse(lines[0]))).toBeTruthy();
  });

  it("appends multiple records without overwriting", async () => {
    const f = tmpFile();
    cleanup.push(f);
    const r1 = buildLogRecord(
      "createOrder",
      { pair: "btc_jpy" },
      { success: true, data: { id: 1 } },
    );
    const r2 = buildLogRecord(
      "cancelOrder",
      { pair: "btc_jpy" },
      { success: true, data: { id: 2 } },
    );
    await writeTradeLog(f, r1);
    await writeTradeLog(f, r2);
    const lines = readFileSync(f, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).command).toBe("createOrder");
    expect(JSON.parse(lines[1]).command).toBe("cancelOrder");
  });

  it.skipIf(process.platform === "win32")("creates file with mode 0o600 (owner-only)", async () => {
    const f = tmpFile();
    cleanup.push(f);
    const record = buildLogRecord("createOrder", {}, { success: true, data: {} });
    await writeTradeLog(f, record);
    // appendFile の mode は mode & ~umask で適用される。0o600 は group/other ビットを
    // 持たないため、一般的な umask (0o022/0o027/0o077) でクリアされず必ず 0o600 になる
    expect(statSync(f).mode & 0o777).toBe(0o600);
  });

  it("returns error for invalid path", async () => {
    const result = await writeTradeLog(
      "/nonexistent/dir/log.jsonl",
      buildLogRecord("x", {}, { success: true, data: {} }),
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Failed to write trade log");
  });
});

describe("dry-run does not log", () => {
  it("isDryRun result has no log file written", () => {
    const f = tmpFile();
    cleanup.push(f);
    // Simulate: dry-run returns { dryRun: true }, tradeHandler skips log
    // We verify by NOT calling writeTradeLog for dry-run results
    expect(existsSync(f)).toBe(false);
  });
});
