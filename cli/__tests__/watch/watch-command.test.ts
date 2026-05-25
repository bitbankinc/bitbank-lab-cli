// 100行超: watch CLI フラグ/出口分岐 + table mode の decimals 注入を網羅
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchCommand } from "../../commands/watch/index.js";
import { EXIT } from "../../exit-codes.js";
import type { IoFactory, TickerCallbacks } from "../../watch/ticker.js";
import { mockGetPairs } from "../test-helpers.js";

function makeFakeFactory(): {
  factory: IoFactory;
  emit: (cb: keyof TickerCallbacks, ...a: unknown[]) => void;
  disconnect: ReturnType<typeof vi.fn>;
} {
  const listeners: Record<string, ((...a: unknown[]) => void) | undefined> = {};
  const emit = vi.fn();
  const disconnect = vi.fn();
  const factory: IoFactory = () =>
    ({
      on: vi.fn((ev: string, cb: (...a: unknown[]) => void) => {
        listeners[ev] = cb;
      }),
      emit,
      disconnect,
    }) as unknown as ReturnType<IoFactory>;
  return {
    factory,
    emit: (cb, ...a) => {
      const ev = cb === "onTicker" ? "message" : cb === "onConnect" ? "connect" : "disconnect";
      const fn = listeners[ev];
      if (ev === "message") fn?.({ room_name: "ticker_btc_jpy", message: { data: a[0] } });
      else if (ev === "connect") fn?.();
      else fn?.(a[0]);
    },
    disconnect,
  };
}

describe("watchCommand", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
  });

  it("rejects unsupported channels with exit code PARAM", async () => {
    const r = await watchCommand({
      channel: "depth",
      pair: "btc_jpy",
      format: "json",
      idleTimeout: 30,
      maxRetries: 0,
      backoffCap: 32,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain("Supported: ticker");
      expect(r.exitCode).toBe(EXIT.PARAM);
    }
  });

  it("rejects missing pair", async () => {
    const r = await watchCommand({
      channel: "ticker",
      format: "json",
      idleTimeout: 30,
      maxRetries: 0,
      backoffCap: 32,
    });
    expect(r.success).toBe(false);
  });

  it("emits JSONL to stdout and exits on count", async () => {
    const { factory, emit } = makeFakeFactory();
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const promise = watchCommand({
      channel: "ticker",
      pair: "btc_jpy",
      format: "json",
      count: 1,
      idleTimeout: 0,
      maxRetries: 0,
      backoffCap: 32,
      ioFactory: factory,
    });
    emit("onConnect");
    emit("onTicker", { last: "100", buy: "99", sell: "101", timestamp: 1 });
    const r = await promise;
    expect(r.success).toBe(true);
    const stdoutCalls = writeSpy.mock.calls.map((c) => String(c[0]));
    const jsonl = stdoutCalls.find((s) => s.includes('"last":100'));
    expect(jsonl).toBeDefined();
    writeSpy.mockRestore();
  });

  it("exits cleanly on duration timeout", async () => {
    const { factory } = makeFakeFactory();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const promise = watchCommand({
      channel: "ticker",
      pair: "btc_jpy",
      format: "json",
      duration: 5,
      idleTimeout: 0,
      maxRetries: 0,
      backoffCap: 32,
      ioFactory: factory,
    });
    await vi.advanceTimersByTimeAsync(5000);
    const r = await promise;
    expect(r.success).toBe(true);
  });

  it("exits with NETWORK exit code when max-retries hits", async () => {
    const { factory, emit } = makeFakeFactory();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const promise = watchCommand({
      channel: "ticker",
      pair: "btc_jpy",
      format: "json",
      idleTimeout: 0,
      maxRetries: 2,
      backoffCap: 32,
      ioFactory: factory,
    });
    emit("onDisconnect", "first");
    await vi.advanceTimersByTimeAsync(1000);
    emit("onDisconnect", "second");
    await vi.advanceTimersByTimeAsync(2000);
    emit("onDisconnect", "third");
    const r = await promise;
    expect(r.success).toBe(false);
    if (!r.success) expect(r.exitCode).toBe(EXIT.NETWORK);
  });

  it("exits cleanly on SIGINT", async () => {
    const { factory } = makeFakeFactory();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const promise = watchCommand({
      channel: "ticker",
      pair: "btc_jpy",
      format: "json",
      idleTimeout: 0,
      maxRetries: 0,
      backoffCap: 32,
      ioFactory: factory,
    });
    process.emit("SIGINT");
    const r = await promise;
    expect(r.success).toBe(true);
    expect(process.listenerCount("SIGINT")).toBe(0);
  });

  it("idle timeout triggers reconnect attempt", async () => {
    const { factory, emit } = makeFakeFactory();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrWrites: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((c) => {
      stderrWrites.push(String(c));
      return true;
    });
    const promise = watchCommand({
      channel: "ticker",
      pair: "btc_jpy",
      format: "json",
      idleTimeout: 5,
      maxRetries: 1,
      backoffCap: 32,
      duration: 30,
      ioFactory: factory,
    });
    emit("onConnect");
    await vi.advanceTimersByTimeAsync(5000);
    expect(stderrWrites.some((w) => w.includes("Idle timeout"))).toBe(true);
    emit("onDisconnect", "idle");
    await vi.advanceTimersByTimeAsync(30000);
    await promise;
  });

  it("table mode uses pair decimals from cache (JPY pair = 0 decimals)", async () => {
    const { factory, emit } = makeFakeFactory();
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((c) => {
      writes.push(String(c));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const promise = watchCommand({
      channel: "ticker",
      pair: "btc_jpy",
      format: "table",
      count: 1,
      idleTimeout: 0,
      maxRetries: 0,
      backoffCap: 32,
      ioFactory: factory,
      getPairs: mockGetPairs,
    });
    // Yield microtasks so the async resolvePairInfo + socket setup complete before emit().
    await vi.advanceTimersByTimeAsync(0);
    emit("onConnect");
    emit("onTicker", { last: "5123456.789", buy: "99", sell: "101", vol: "1.23456", timestamp: 1 });
    await promise;
    expect(writes.some((w) => w.includes("last=5123457"))).toBe(true);
    expect(writes.some((w) => w.includes("vol=1.2346"))).toBe(true);
  });
});
