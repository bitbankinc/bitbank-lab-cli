import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockWatchCommand = vi.fn();
const mockOutput = vi.fn();

vi.mock("../../commands/watch/index.js", () => ({
  watchCommand: (...args: unknown[]) => mockWatchCommand(...args),
}));
vi.mock("../../output.js", () => ({
  output: (...args: unknown[]) => mockOutput(...args),
}));

import { watchCommands } from "../../commands/watch-handler.js";

const handler = watchCommands.watch.handler;

describe("watch handler", () => {
  let stderrWrites: string[];
  let stderrSpy: { mockRestore: () => void };
  let originalArgv: string[];
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWatchCommand.mockResolvedValue({ success: true, data: undefined });
    stderrWrites = [];
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(((c: unknown) => {
      stderrWrites.push(String(c));
      return true;
    }) as never);
    originalArgv = process.argv;
    originalIsTTY = process.stdout.isTTY;
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    process.argv = originalArgv;
    Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
  });

  function setTTY(v: boolean): void {
    Object.defineProperty(process.stdout, "isTTY", { value: v, configurable: true });
  }

  it("forwards channel and pair as positional args", async () => {
    setTTY(false);
    process.argv = ["node", "cli", "watch", "ticker", "btc_jpy"];
    await handler(["ticker", "btc_jpy"], {}, "json");
    expect(mockWatchCommand).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "ticker", pair: "btc_jpy" }),
    );
  });

  it("uses table on TTY when --format is not specified", async () => {
    setTTY(true);
    process.argv = ["node", "cli", "watch", "ticker", "btc_jpy"];
    await handler(["ticker", "btc_jpy"], {}, "json");
    expect(mockWatchCommand).toHaveBeenCalledWith(expect.objectContaining({ format: "table" }));
  });

  it("falls back to json with stderr warning when table is requested on non-TTY", async () => {
    setTTY(false);
    process.argv = ["node", "cli", "watch", "ticker", "btc_jpy", "--format=table"];
    await handler(["ticker", "btc_jpy"], { format: "table" }, "table");
    expect(mockWatchCommand).toHaveBeenCalledWith(expect.objectContaining({ format: "json" }));
    expect(stderrWrites.join("")).toContain("not a TTY");
  });

  it("non-TTY without --format defaults to json silently", async () => {
    setTTY(false);
    process.argv = ["node", "cli", "watch", "ticker", "btc_jpy"];
    await handler(["ticker", "btc_jpy"], {}, "json");
    expect(mockWatchCommand).toHaveBeenCalledWith(expect.objectContaining({ format: "json" }));
    expect(stderrWrites.join("")).not.toContain("not a TTY");
  });

  it("parses numeric options", async () => {
    setTTY(false);
    process.argv = ["node", "cli", "watch", "ticker", "btc_jpy"];
    await handler(
      ["ticker", "btc_jpy"],
      {
        duration: "10",
        count: "5",
        "idle-timeout": "15",
        "max-retries": "3",
        "backoff-cap": "16",
      },
      "json",
    );
    expect(mockWatchCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        duration: 10,
        count: 5,
        idleTimeout: 15,
        maxRetries: 3,
        backoffCap: 16,
      }),
    );
  });

  it("rejects invalid numeric option without invoking watchCommand", async () => {
    setTTY(false);
    process.argv = ["node", "cli", "watch", "ticker", "btc_jpy"];
    await handler(["ticker", "btc_jpy"], { "max-retries": "foo" }, "json");
    expect(mockWatchCommand).not.toHaveBeenCalled();
    expect(mockOutput).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining("max-retries") }),
      "json",
    );
  });

  it("calls output() when watchCommand returns failure", async () => {
    setTTY(false);
    process.argv = ["node", "cli", "watch", "foo", "btc_jpy"];
    mockWatchCommand.mockResolvedValueOnce({ success: false, error: "bad", exitCode: 4 });
    await handler(["foo", "btc_jpy"], {}, "json");
    expect(mockOutput).toHaveBeenCalledWith({ success: false, error: "bad", exitCode: 4 }, "json");
  });
});
