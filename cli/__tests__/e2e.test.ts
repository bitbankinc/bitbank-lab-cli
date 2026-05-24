// 100行超: CLI 全体の E2E ハッピー/エラーパスを網羅
import { execFile } from "node:child_process";
import { describe, expect, it } from "vitest";

const CLI = "cli/index.ts";

function run(...args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile("npx", ["tsx", CLI, ...args], { timeout: 15000 }, (error, stdout, stderr) => {
      const code = error ? Number(error.code) || 1 : 0;
      resolve({ stdout, stderr, exitCode: code });
    });
  });
}

describe("CLI E2E", () => {
  it("shows global help with --help (exitCode 0)", async () => {
    const { stdout, exitCode } = await run("--help");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Usage: bitbank");
    expect(stdout).toContain("Commands:");
  });

  it("shows global help when invoked with no args", async () => {
    const { stdout, exitCode } = await run();
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Usage: bitbank");
  });

  it("shows subcommand help with <command> --help", async () => {
    const { stdout, exitCode } = await run("ticker", "--help");
    expect(exitCode).toBe(0);
    expect(stdout.length).toBeGreaterThan(0);
  });

  it("exits with code 4 for unknown command", async () => {
    const { stderr, exitCode } = await run("nonexistent-command");
    expect(exitCode).toBe(4);
    expect(stderr).toContain("Unknown command");
  });

  it("outputs JSON envelope on --machine for unknown command", async () => {
    const { stdout, exitCode } = await run("--machine", "nonexistent-command");
    expect(exitCode).toBe(4);
    const parsed = JSON.parse(stdout);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Unknown command");
    expect(parsed.exitCode).toBe(4);
  });

  it("exits with code 4 for --format=invalid", async () => {
    const { stderr, exitCode } = await run("--format=invalid", "ticker");
    expect(exitCode).toBe(4);
    expect(stderr).toContain("Unknown format");
  });

  it("outputs --format=invalid error as JSON with --machine", async () => {
    const { stdout, exitCode } = await run("--machine", "--format=invalid", "ticker");
    expect(exitCode).toBe(4);
    const parsed = JSON.parse(stdout);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Unknown format");
  });

  it("lists available commands in help output", async () => {
    const { stdout } = await run("--help");
    expect(stdout).toContain("ticker");
    expect(stdout).toContain("status");
    expect(stdout).toContain("candles");
    expect(stdout).toContain("trade <subcommand>");
  });

  it("shows trade subcommand list when invoked as 'bitbank trade'", async () => {
    const { stdout, exitCode } = await run("trade");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Usage: bitbank trade");
    expect(stdout).toContain("create-order");
  });

  it("rejects unknown trade subcommand with exit 4", async () => {
    const { stderr, exitCode } = await run("trade", "nope");
    expect(exitCode).toBe(4);
    expect(stderr).toContain("Unknown trade subcommand");
  });

  it("rejects flat invocation of trade commands (breaking change)", async () => {
    const { stderr, exitCode } = await run("create-order");
    expect(exitCode).toBe(4);
    expect(stderr).toContain("Unknown command");
  });

  it("shows trade subcommand help with 'trade <cmd> --help'", async () => {
    const { stdout, exitCode } = await run("trade", "create-order", "--help");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Usage: bitbank trade create-order");
  });

  const describeE2E = process.env.TEST_E2E === "1" ? describe : describe.skip;

  describeE2E("live API (TEST_E2E=1)", () => {
    it("status command returns exchange statuses", async () => {
      const { stdout, exitCode } = await run("status");
      expect(exitCode).toBe(0);
      const data = JSON.parse(stdout);
      expect(Array.isArray(data)).toBe(true);
      expect(data[0]).toHaveProperty("pair");
      expect(data[0]).toHaveProperty("status");
    });

    it("pairs command returns pair settings", async () => {
      const { stdout, exitCode } = await run("pairs");
      expect(exitCode).toBe(0);
      const data = JSON.parse(stdout);
      expect(Array.isArray(data)).toBe(true);
      expect(data[0]).toHaveProperty("name");
    });
  });
});
