// 100行超: ticker socket 接続/メッセージ/エラー分岐を網羅
import { describe, expect, it, vi } from "vitest";
import { type IoFactory, parseTicker, startTickerSocket } from "../../watch/ticker.js";

function makeMockSocket() {
  const listeners: Record<string, ((...a: unknown[]) => void) | undefined> = {};
  const emit = vi.fn();
  const disconnect = vi.fn();
  const on = vi.fn((ev: string, cb: (...a: unknown[]) => void) => {
    listeners[ev] = cb;
  });
  const socket = { on, emit, disconnect } as unknown as ReturnType<IoFactory>;
  return { socket, listeners };
}

const factoryFor =
  (s: ReturnType<IoFactory>): IoFactory =>
  () =>
    s;

describe("parseTicker", () => {
  it("maps bitbank fields and timestamp into numbers", () => {
    const t = parseTicker("btc_jpy", {
      last: "100",
      buy: "99",
      sell: "101",
      high: "110",
      low: "90",
      vol: "1.23",
      timestamp: 1746525600000,
    });
    expect(t.pair).toBe("btc_jpy");
    expect(t.last).toBe(100);
    expect(t.bid).toBe(99);
    expect(t.ask).toBe(101);
    expect(t.vol).toBe(1.23);
    expect(t.ts).toBe(new Date(1746525600000).toISOString());
  });

  it("falls back to Date.now() when timestamp is missing", () => {
    const t = parseTicker("btc_jpy", { last: "100" });
    expect(t.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("missing/null fields become null without throwing", () => {
    const t = parseTicker("btc_jpy", {});
    expect(t.last).toBeNull();
    expect(t.bid).toBeNull();
    expect(t.ask).toBeNull();
    expect(t.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("coerces non-string numeric fields and treats null/non-numeric timestamp as fallback", () => {
    const t = parseTicker("btc_jpy", { last: 123, buy: null, timestamp: "bad" });
    expect(t.last).toBe(123);
    expect(t.bid).toBeNull();
    expect(t.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("empty-string fields become null (not parse error)", () => {
    const t = parseTicker("btc_jpy", { last: "", buy: "  " });
    expect(t.last).toBeNull();
    expect(t.bid).toBeNull();
  });
});

describe("startTickerSocket", () => {
  it("subscribes to ticker_<pair> on connect", () => {
    const { socket, listeners } = makeMockSocket();
    const onConnect = vi.fn();
    startTickerSocket(
      "btc_jpy",
      { onConnect, onTicker: vi.fn(), onDisconnect: vi.fn() },
      factoryFor(socket),
    );
    listeners.connect?.();
    expect(socket.emit).toHaveBeenCalledWith("join-room", "ticker_btc_jpy");
    expect(onConnect).toHaveBeenCalled();
  });

  it("forwards parsed ticker on matching room messages", () => {
    const { socket, listeners } = makeMockSocket();
    const onTicker = vi.fn();
    startTickerSocket(
      "btc_jpy",
      { onConnect: vi.fn(), onTicker, onDisconnect: vi.fn() },
      factoryFor(socket),
    );
    listeners.message?.({
      room_name: "ticker_btc_jpy",
      message: { data: { last: "200", buy: "199", sell: "201", timestamp: 1 } },
    });
    expect(onTicker).toHaveBeenCalledWith(expect.objectContaining({ pair: "btc_jpy", last: 200 }));
  });

  it("ignores malformed messages without throwing", () => {
    const { socket, listeners } = makeMockSocket();
    const onTicker = vi.fn();
    startTickerSocket(
      "btc_jpy",
      { onConnect: vi.fn(), onTicker, onDisconnect: vi.fn() },
      factoryFor(socket),
    );
    expect(() => listeners.message?.({ room_name: "ticker_btc_jpy" })).not.toThrow();
    expect(() => listeners.message?.({ room_name: "ticker_btc_jpy", message: {} })).not.toThrow();
    expect(onTicker).not.toHaveBeenCalled();
  });

  it("ignores messages for other rooms", () => {
    const { socket, listeners } = makeMockSocket();
    const onTicker = vi.fn();
    startTickerSocket(
      "btc_jpy",
      { onConnect: vi.fn(), onTicker, onDisconnect: vi.fn() },
      factoryFor(socket),
    );
    listeners.message?.({ room_name: "transactions_btc_jpy", message: { data: {} } });
    expect(onTicker).not.toHaveBeenCalled();
  });

  it("connect_error and disconnect both flow into onDisconnect", () => {
    const { socket, listeners } = makeMockSocket();
    const onDisconnect = vi.fn();
    startTickerSocket(
      "btc_jpy",
      { onConnect: vi.fn(), onTicker: vi.fn(), onDisconnect },
      factoryFor(socket),
    );
    listeners.disconnect?.("transport close");
    listeners.connect_error?.(new Error("dns fail"));
    expect(onDisconnect).toHaveBeenNthCalledWith(1, "transport close");
    expect(onDisconnect).toHaveBeenNthCalledWith(2, "connect_error: dns fail");
  });

  it("stop() leaves room and disconnects", () => {
    const { socket } = makeMockSocket();
    const handle = startTickerSocket(
      "btc_jpy",
      { onConnect: vi.fn(), onTicker: vi.fn(), onDisconnect: vi.fn() },
      factoryFor(socket),
    );
    handle.stop();
    expect(socket.emit).toHaveBeenCalledWith("leave-room", "ticker_btc_jpy");
    expect(socket.disconnect).toHaveBeenCalled();
  });
});
