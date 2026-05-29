import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { captureStdout } from "./test-helpers.js";

const DEFAULT_LOG = join(homedir(), ".bitbank-trade.log");

const writeTradeLog = vi.fn().mockResolvedValue({ success: true, data: { written: true } });
const buildLogRecord = vi
  .fn()
  .mockReturnValue({ timestamp: "t", command: "c", params: {}, success: true });

vi.mock("../trade-log.js", () => ({ writeTradeLog, buildLogRecord }));

const cancelMod = await import("../commands/trade/cancel-order.js");
const mockCancel = vi.spyOn(cancelMod, "cancelOrder").mockResolvedValue({
  success: true,
  data: { order_id: 1, pair: "btc_jpy", status: "CANCELED" },
} as ReturnType<typeof cancelMod.cancelOrder> extends Promise<infer R> ? R : never);

const { tradeHandler } = await import("../commands/make-handler.js");

function makeTh() {
  return tradeHandler(
    new URL("../commands/trade/cancel-order.js", import.meta.url).pathname,
    "cancelOrder",
    (v) => ({ pair: v.pair as string, orderId: v["order-id"] as string }),
  );
}

describe("trade audit default logging", () => {
  it("logs to ~/.bitbank-trade.log by default", async () => {
    const cap = captureStdout();
    const th = makeTh();
    await th([], { pair: "btc_jpy", "order-id": "1" }, "json");
    cap.restore();
    expect(writeTradeLog).toHaveBeenCalledWith(DEFAULT_LOG, expect.anything());
  });

  it("logs to custom path when --log-file specified", async () => {
    writeTradeLog.mockClear();
    const cap = captureStdout();
    const th = makeTh();
    await th([], { pair: "btc_jpy", "order-id": "1", "log-file": "/tmp/custom.log" }, "json");
    cap.restore();
    expect(writeTradeLog).toHaveBeenCalledWith("/tmp/custom.log", expect.anything());
  });

  it("does not log when --no-log is set", async () => {
    writeTradeLog.mockClear();
    const cap = captureStdout();
    const th = makeTh();
    await th([], { pair: "btc_jpy", "order-id": "1", "no-log": true }, "json");
    cap.restore();
    expect(writeTradeLog).not.toHaveBeenCalled();
  });

  it("writes warning to stderr when log write fails (human mode)", async () => {
    writeTradeLog.mockClear();
    writeTradeLog.mockResolvedValueOnce({
      success: false,
      error: "Failed to write trade log: EACCES",
    });
    const cap = captureStdout();
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const th = makeTh();
    await th([], { pair: "btc_jpy", "order-id": "1" }, "json");
    cap.restore();
    expect(errSpy).toHaveBeenCalledWith("Failed to write trade log: EACCES\n");
    errSpy.mockRestore();
  });

  it("does not write the non-JSON log-failure warning to stderr in machine mode (#7)", async () => {
    writeTradeLog.mockClear();
    writeTradeLog.mockResolvedValueOnce({
      success: false,
      error: "Failed to write trade log: EACCES",
    });
    const cap = captureStdout();
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const th = makeTh();
    await th([], { pair: "btc_jpy", "order-id": "1", machine: true }, "json");
    const out = cap.read();
    cap.restore();
    errSpy.mockRestore();
    // stdout stays a single valid JSON envelope; stderr is not polluted with a raw line.
    expect(JSON.parse(out).success).toBe(true);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("does not log on dry-run even with default enabled", async () => {
    writeTradeLog.mockClear();
    mockCancel.mockResolvedValueOnce({
      success: true,
      data: {
        dryRun: true,
        endpoint: "/v1/user/spot/cancel_order",
        body: { pair: "btc_jpy", order_id: 1 },
        executeHint: "npx bitbank trade cancel-order --execute --confirm=I-UNDERSTAND-CANCEL-ORDER",
        confirmPhrase: "I-UNDERSTAND-CANCEL-ORDER",
      },
    } as never);
    const cap = captureStdout();
    const th = makeTh();
    await th([], { pair: "btc_jpy", "order-id": "1" }, "json");
    cap.restore();
    expect(writeTradeLog).not.toHaveBeenCalled();
  });
});
