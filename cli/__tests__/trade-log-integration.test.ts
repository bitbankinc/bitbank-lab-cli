// 100行超: trade ログの統合パスを網羅
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrder } from "../commands/trade/create-order.js";
import { TradeLogRecordSchema } from "../trade-log-schema.js";
import { buildLogRecord, writeTradeLog } from "../trade-log.js";
import { TEST_CREDS, mockFetchRaw } from "./test-helpers.js";

function tmpFile(): string {
  return join(tmpdir(), `trade-log-int-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
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

describe("trade log integration", () => {
  it("logs after --execute API success", async () => {
    const f = tmpFile();
    cleanup.push(f);

    const result = await createOrder(
      {
        pair: "btc_jpy",
        side: "buy",
        type: "limit",
        price: "5000000",
        amount: "0.01",
        execute: true,
        confirm: "I-UNDERSTAND-CREATE-ORDER",
      },
      {
        fetch: mockFetchRaw({
          success: 1,
          data: {
            order_id: 99,
            pair: "btc_jpy",
            side: "buy",
            type: "limit",
            start_amount: "0.01",
            remaining_amount: "0.01",
            executed_amount: "0",
            price: "5000000",
            post_only: false,
            average_price: "0",
            ordered_at: 1700000000000,
            expire_at: null,
            status: "UNFILLED",
          },
        }),
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "1",
      },
    );

    // Simulate what tradeHandler does: log only when not dry-run
    if (result.success && !("dryRun" in result.data)) {
      await writeTradeLog(f, buildLogRecord("createOrder", { pair: "btc_jpy" }, result));
    }

    expect(existsSync(f)).toBe(true);
    const lines = readFileSync(f, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]);
    expect(TradeLogRecordSchema.safeParse(record).success).toBe(true);
    expect(record.command).toBe("createOrder");
    expect(record.success).toBe(true);
    expect(record.data.order_id).toBe(99);
  });

  it("does NOT log on dry-run", async () => {
    const f = tmpFile();
    cleanup.push(f);
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const result = await createOrder({
      pair: "btc_jpy",
      side: "buy",
      type: "limit",
      price: "5000000",
      amount: "0.01",
    });

    // Simulate tradeHandler: isDryRun check prevents logging
    if (result.success && !("dryRun" in result.data)) {
      await writeTradeLog(f, buildLogRecord("createOrder", { pair: "btc_jpy" }, result));
    }

    writeSpy.mockRestore();
    expect(existsSync(f)).toBe(false);
  });

  it("logs API failure results", async () => {
    const f = tmpFile();
    cleanup.push(f);

    const result = await createOrder(
      {
        pair: "btc_jpy",
        side: "buy",
        type: "limit",
        price: "5000000",
        amount: "0.01",
        execute: true,
        confirm: "I-UNDERSTAND-CREATE-ORDER",
      },
      {
        fetch: mockFetchRaw({ success: 0, data: { code: 10001 } }, 400),
        retries: 0,
        credentials: TEST_CREDS,
        nonce: "1",
      },
    );

    // tradeHandler logs failures too (not a dry-run)
    if (
      !(
        result.success &&
        typeof result.data === "object" &&
        result.data !== null &&
        "dryRun" in result.data
      )
    ) {
      await writeTradeLog(f, buildLogRecord("createOrder", { pair: "btc_jpy" }, result));
    }

    expect(existsSync(f)).toBe(true);
    const record = JSON.parse(readFileSync(f, "utf8").trim());
    expect(record.success).toBe(false);
    expect(record.error).toBeDefined();
  });
});
