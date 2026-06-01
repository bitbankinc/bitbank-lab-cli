// 100行超: PubNub private stream の購読/イベント分岐を網羅
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock PubNub
const mockPubnub = {
  setToken: vi.fn(),
  addListener: vi.fn(),
  subscribe: vi.fn(),
  unsubscribeAll: vi.fn(),
};
vi.mock("pubnub", () => ({
  default: vi.fn(() => mockPubnub),
}));

vi.mock("../../commands/stream/format.js", () => ({
  writeStreamMessage: vi.fn(),
}));

// Mock privateGet
const mockPrivateGet = vi.fn();
vi.mock("../../http-private.js", () => ({
  privateGet: (...args: unknown[]) => mockPrivateGet(...args),
}));

vi.mock("../../profiles-resolver.js", () => ({
  resolveCredentials: () => ({ success: true, data: { apiKey: "key", apiSecret: "secret" } }),
}));

import { writeStreamMessage } from "../../commands/stream/format.js";
import { startPrivateStream } from "../../commands/stream/private.js";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockPrivateGet.mockResolvedValue({
    success: true,
    data: { pubnub_channel: "ch_123", pubnub_token: "tok_abc" },
  });
});

describe("startPrivateStream", () => {
  it("returns error when subscribe API fails with auth error", async () => {
    mockPrivateGet.mockResolvedValueOnce({ success: false, error: "20001: API認証失敗" });
    const result = await startPrivateStream({
      format: "json",
      credentials: { apiKey: "k", apiSecret: "s" },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("API認証失敗");
  });

  it("returns error when subscribe API fails", async () => {
    mockPrivateGet.mockResolvedValueOnce({ success: false, error: "auth failed" });
    const result = await startPrivateStream({
      format: "json",
      credentials: { apiKey: "k", apiSecret: "s" },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("auth failed");
  });

  it("connects and subscribes to PubNub channel", async () => {
    const result = await startPrivateStream({
      format: "json",
      credentials: { apiKey: "k", apiSecret: "s" },
    });
    expect(result.success).toBe(true);
    expect(mockPubnub.setToken).toHaveBeenCalledWith("tok_abc");
    expect(mockPubnub.subscribe).toHaveBeenCalledWith({ channels: ["ch_123"] });
  });

  it("filters messages by event type", async () => {
    await startPrivateStream({
      format: "json",
      filter: ["spot_trade"],
      credentials: { apiKey: "k", apiSecret: "s" },
    });
    const listener = mockPubnub.addListener.mock.calls[0][0];

    // Matching event
    listener.message({ channel: "ch_123", message: { event_type: "spot_trade", price: "1" } });
    expect(writeStreamMessage).toHaveBeenCalledTimes(1);

    // Non-matching event
    listener.message({ channel: "ch_123", message: { event_type: "asset_update", free: "1" } });
    expect(writeStreamMessage).toHaveBeenCalledTimes(1);
  });

  it("stop() cleans up", async () => {
    const result = await startPrivateStream({
      format: "json",
      credentials: { apiKey: "k", apiSecret: "s" },
    });
    if (result.success) result.data.stop();
    expect(mockPubnub.unsubscribeAll).toHaveBeenCalled();
  });

  it("emits a connected message on PNConnectedCategory status", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await startPrivateStream({
      format: "json",
      credentials: { apiKey: "k", apiSecret: "s" },
    });
    const listener = mockPubnub.addListener.mock.calls[0][0];
    listener.status({ category: "PNConnectedCategory" });
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("Private stream connected"));
    // チャネルID/トークンは接続ログに出さない（F-5 の回帰防止）
    expect(stderr).not.toHaveBeenCalledWith(expect.stringContaining("ch_123"));
    expect(stderr).not.toHaveBeenCalledWith(expect.stringContaining("tok_abc"));
    // Non-connected categories should not emit
    stderr.mockClear();
    listener.status({ category: "PNNetworkDownCategory" });
    expect(stderr).not.toHaveBeenCalled();
    stderr.mockRestore();
  });

  it("refreshes the PubNub token periodically", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await startPrivateStream({
      format: "json",
      credentials: { apiKey: "k", apiSecret: "s" },
    });
    mockPubnub.setToken.mockClear();
    mockPrivateGet.mockResolvedValueOnce({
      success: true,
      data: { pubnub_channel: "ch_123", pubnub_token: "tok_refreshed" },
    });
    await vi.advanceTimersByTimeAsync((12 * 60 - 5) * 60 * 1000);
    expect(mockPubnub.setToken).toHaveBeenCalledWith("tok_refreshed");
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("Token refreshed"));
    stderr.mockRestore();
  });

  it("logs a failure when token refresh fails", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await startPrivateStream({
      format: "json",
      credentials: { apiKey: "k", apiSecret: "s" },
    });
    mockPrivateGet.mockResolvedValueOnce({ success: false, error: "rate limited" });
    await vi.advanceTimersByTimeAsync((12 * 60 - 5) * 60 * 1000);
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining("Token refresh failed: rate limited"),
    );
    stderr.mockRestore();
  });

  it("uses resolveCredentials() when credentials are not provided", async () => {
    const result = await startPrivateStream({ format: "json" });
    expect(result.success).toBe(true);
  });

  it("propagates resolveCredentials errors", async () => {
    vi.doMock("../../profiles-resolver.js", () => ({
      resolveCredentials: () => ({ success: false, error: "missing api key", exitCode: 2 }),
    }));
    vi.resetModules();
    try {
      const { startPrivateStream: freshStart } = await import("../../commands/stream/private.js");
      const result = await freshStart({ format: "json" });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toContain("missing api key");
    } finally {
      vi.doUnmock("../../profiles-resolver.js");
      vi.resetModules();
    }
  });
});
