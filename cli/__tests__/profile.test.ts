// 100行超: profile 切替の各分岐を網羅（loadEnvProfile は env を mutate しない）
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadEnvProfile, parseEnvFile, warnIfInsecure } from "../profile.js";

describe("parseEnvFile", () => {
  it("parses key=value lines", () => {
    expect(parseEnvFile("FOO=bar\nBAZ=qux")).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("ignores comments and blank lines", () => {
    expect(parseEnvFile("# comment\n\nKEY=val\n")).toEqual({ KEY: "val" });
  });

  it("strips surrounding quotes", () => {
    expect(parseEnvFile("A=\"hello\"\nB='world'")).toEqual({ A: "hello", B: "world" });
  });

  it("handles values with = sign", () => {
    expect(parseEnvFile("KEY=a=b=c")).toEqual({ KEY: "a=b=c" });
  });
});

describe("loadEnvProfile", () => {
  let origCwd: typeof process.cwd;
  let tmpDir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "profile-test-"));
    origCwd = process.cwd;
    process.cwd = () => tmpDir;
    savedEnv.BITBANK_API_KEY = process.env.BITBANK_API_KEY;
    savedEnv.BITBANK_API_SECRET = process.env.BITBANK_API_SECRET;
    savedEnv.PATH = process.env.PATH;
    savedEnv.NODE_OPTIONS = process.env.NODE_OPTIONS;
  });

  afterEach(() => {
    process.cwd = origCwd;
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns credentials from .env.<profile>", () => {
    writeFileSync(join(tmpDir, ".env.bot1"), "BITBANK_API_KEY=k1\nBITBANK_API_SECRET=s1");
    const result = loadEnvProfile("bot1");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ apiKey: "k1", apiSecret: "s1" });
    }
  });

  it("does not mutate process.env", () => {
    writeFileSync(join(tmpDir, ".env.bot1"), "BITBANK_API_KEY=k1\nBITBANK_API_SECRET=s1");
    // biome-ignore lint/performance/noDelete: process.env requires delete
    delete process.env.BITBANK_API_KEY;
    // biome-ignore lint/performance/noDelete: process.env requires delete
    delete process.env.BITBANK_API_SECRET;
    const before = { ...process.env };
    loadEnvProfile("bot1");
    expect(process.env.BITBANK_API_KEY).toBeUndefined();
    expect(process.env.BITBANK_API_SECRET).toBeUndefined();
    expect(process.env).toEqual(before);
  });

  it("returns PARAM error for missing profile file", () => {
    const result = loadEnvProfile("nonexistent");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not found");
      expect(result.exitCode).toBe(4);
    }
  });

  it("rejects profile names with path traversal", () => {
    for (const name of ["../etc/passwd", "..\\foo", "sub/dir", "a\\b", "foo..bar"]) {
      const result = loadEnvProfile(name);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Invalid profile name");
        expect(result.exitCode).toBe(4);
      }
    }
  });

  it("rejects profile names with disallowed characters", () => {
    for (const name of ["foo bar", ".hidden", "foo\0bar", "foo\nbar", "foo;bar", ""]) {
      const result = loadEnvProfile(name);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Invalid profile name");
        expect(result.exitCode).toBe(4);
      }
    }
  });

  it("accepts valid profile names", () => {
    writeFileSync(join(tmpDir, ".env.valid_name-1"), "BITBANK_API_KEY=v1\nBITBANK_API_SECRET=s1");
    writeFileSync(join(tmpDir, ".env.test"), "BITBANK_API_KEY=t1\nBITBANK_API_SECRET=s2");
    expect(loadEnvProfile("valid_name-1").success).toBe(true);
    expect(loadEnvProfile("test").success).toBe(true);
  });

  it("warns and ignores non-BITBANK_* keys (no env mutation)", () => {
    const origPath = process.env.PATH;
    const origNodeOpts = process.env.NODE_OPTIONS;
    writeFileSync(
      join(tmpDir, ".env.bot2"),
      [
        "BITBANK_API_KEY=foo",
        "BITBANK_API_SECRET=bar",
        "PATH=/evil",
        "NODE_OPTIONS=--require ./mal.js",
        "LD_PRELOAD=/tmp/x.so",
      ].join("\n"),
    );
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const result = loadEnvProfile("bot2");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ apiKey: "foo", apiSecret: "bar" });
    }
    expect(process.env.PATH).toBe(origPath);
    expect(process.env.NODE_OPTIONS).toBe(origNodeOpts);
    const warnings = spy.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.includes("ignored non-BITBANK_*"));
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("PATH");
    expect(warnings[0]).toContain("NODE_OPTIONS");
    expect(warnings[0]).toContain("LD_PRELOAD");
    spy.mockRestore();
  });

  it("returns AUTH error when BITBANK_API_KEY or _SECRET is missing", () => {
    writeFileSync(join(tmpDir, ".env.partial"), "BITBANK_API_KEY=foo");
    const result = loadEnvProfile("partial");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("BITBANK_API_KEY");
      expect(result.error).toContain("BITBANK_API_SECRET");
    }
  });
});

describe("warnIfInsecure", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "perm-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("warns when file is group/other readable (0644)", () => {
    const filepath = join(tmpDir, ".env.prod");
    writeFileSync(filepath, "SECRET=x");
    chmodSync(filepath, 0o644);
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    warnIfInsecure(filepath, ".env.prod");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("readable by other users");
    expect(spy.mock.calls[0][0]).toContain("chmod 600");
    spy.mockRestore();
  });

  it("does not warn when file is owner-only (0600)", () => {
    const filepath = join(tmpDir, ".env.safe");
    writeFileSync(filepath, "SECRET=x");
    chmodSync(filepath, 0o600);
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    warnIfInsecure(filepath, ".env.safe");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("skips check on Windows", () => {
    const filepath = join(tmpDir, ".env.win");
    writeFileSync(filepath, "SECRET=x");
    chmodSync(filepath, 0o644);
    const origPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    warnIfInsecure(filepath, ".env.win");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    Object.defineProperty(process, "platform", { value: origPlatform });
  });
});
