import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readVersion, versionHandler } from "../commands/version.js";
import { EXIT } from "../exit-codes.js";

describe("readVersion", () => {
  it("returns the version from the repo package.json by default", () => {
    const r = readVersion();
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("returns Err when the file cannot be read", () => {
    const r = readVersion(pathToFileURL("/no/such/dir/package.json"));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.exitCode).toBe(EXIT.GENERAL);
  });

  it("returns Err when version field is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "bb-version-"));
    try {
      const p = join(dir, "package.json");
      writeFileSync(p, JSON.stringify({ name: "x" }));
      const r = readVersion(pathToFileURL(p));
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error).toContain("version");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("versionHandler", () => {
  let out: string[] = [];
  const spy = () =>
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      out.push(String(chunk));
      return true;
    });
  afterEach(() => {
    out = [];
    vi.restoreAllMocks();
  });

  it("human: prints the bare version line", () => {
    spy();
    versionHandler(false);
    expect(out.join("")).toMatch(/^\d+\.\d+\.\d+\S*\n$/);
  });

  it("--machine: prints the standard success envelope", () => {
    spy();
    versionHandler(true);
    const env = JSON.parse(out.join("")) as { success: boolean; data: { version: string } };
    expect(env.success).toBe(true);
    expect(env.data.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
