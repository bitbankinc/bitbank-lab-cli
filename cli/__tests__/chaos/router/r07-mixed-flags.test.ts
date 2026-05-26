import { execFile } from "node:child_process";
import { describe, expect, it } from "vitest";

const CLI = "cli/index.ts";

function run(...args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile("npx", ["tsx", CLI, ...args], { timeout: 15000 }, (error, stdout, stderr) => {
      resolve({ stdout, stderr, exitCode: error ? Number(error.code) || 1 : 0 });
    });
  });
}

describe("Chaos R-07: global flags mixed with subcommand flags", () => {
  it("--format=json before subcommand is parsed (ticker no pair → error)", async () => {
    // ticker without pair returns validation error — no network call
    const { stderr, exitCode } = await run("--format=json", "ticker");
    expect(exitCode).toBe(4);
    expect(stderr).toContain("pair is required");
  });

  it("--machine flag wraps subcommand error as JSON", async () => {
    const { stdout, exitCode } = await run("--machine", "ticker");
    expect(exitCode).toBe(4);
    const parsed = JSON.parse(stdout);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("pair is required");
    expect(parsed.exitCode).toBe(4);
  });

  it("--help after global flags still shows help", async () => {
    const { stdout, exitCode } = await run("--format=table", "--help");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Usage: bitbank");
  });

  it("--format=table with subcommand error does not crash", async () => {
    // depth without pair → validation error, table format doesn't matter
    const { stderr, exitCode } = await run("--format=table", "depth");
    expect(exitCode).toBe(4);
    expect(stderr).toContain("pair is required");
  });
});
