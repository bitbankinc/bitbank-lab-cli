// 100行超: profiles.json の TOCTOU 競合を lockfile 方式 (O_EXCL) で解消することの検証。
// 並列 add (cross-process)、add vs remove、ロック取得タイムアウト、ロック解放を確認。
import { spawn } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { updateProfiles } from "../../profiles-mutate.js";
import {
  emptyProfilesFile,
  loadProfiles,
  type ProfilesFile,
  saveProfiles,
} from "../../profiles-store.js";

type SpawnResult = { code: number; stdout: string; stderr: string };

function spawnCmd(args: string[], env: NodeJS.ProcessEnv): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", "cli/index.ts", ...args], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

describe("profile cross-process parallel CRUD (TOCTOU)", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "profile-concurrent-"));
    path = join(dir, "profiles.json");
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("parallel add x N: all profiles are preserved", async () => {
    const N = 5;
    const tasks = Array.from({ length: N }, (_, i) =>
      spawnCmd(["profile", "add", `acct${i}`], {
        BITBANK_PROFILES_PATH: path,
        BITBANK_API_KEY: `K${i}`,
        BITBANK_API_SECRET: `S${i}`,
      }),
    );
    const results = await Promise.all(tasks);
    for (const r of results) expect(r.code).toBe(0);
    const file = JSON.parse(readFileSync(path, "utf-8")) as ProfilesFile;
    const names = Object.keys(file.profiles).sort();
    expect(names).toEqual(Array.from({ length: N }, (_, i) => `acct${i}`).sort());
  }, 60_000);

  it("parallel add vs remove: both effects land regardless of ordering", async () => {
    saveProfiles(
      {
        version: 1,
        default: null,
        profiles: { existing: { key: "k", secret: "s", createdAt: "t" } },
      },
      path,
    );
    const [addR, removeR] = await Promise.all([
      spawnCmd(["profile", "add", "newone"], {
        BITBANK_PROFILES_PATH: path,
        BITBANK_API_KEY: "NK",
        BITBANK_API_SECRET: "NS",
      }),
      spawnCmd(["profile", "remove", "existing", "--confirm"], {
        BITBANK_PROFILES_PATH: path,
      }),
    ]);
    expect(addR.code).toBe(0);
    expect(removeR.code).toBe(0);
    const file = JSON.parse(readFileSync(path, "utf-8")) as ProfilesFile;
    expect(file.profiles.newone).toBeDefined();
    expect(file.profiles.existing).toBeUndefined();
  }, 60_000);
});

describe("updateProfiles lock semantics", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "profile-lock-"));
    path = join(dir, "profiles.json");
    saveProfiles(emptyProfilesFile(), path);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("returns Result.error on lock timeout (no throw)", () => {
    const lock = `${path}.lock`;
    closeSync(openSync(lock, "wx", 0o600));
    try {
      const r = updateProfiles(
        (current) => ({
          success: true,
          data: {
            ...current,
            profiles: {
              ...current.profiles,
              mine: { key: "k", secret: "TOPSECRET", createdAt: "t" },
            },
          },
        }),
        { maxWaitMs: 100, path },
      );
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error).toMatch(/lock/i);
        // secret が error message に漏れない
        expect(r.error).not.toContain("TOPSECRET");
      }
    } finally {
      unlinkSync(lock);
    }
  });

  it("releases lock on success (next call can acquire)", () => {
    const r1 = updateProfiles(
      (current) => ({
        success: true,
        data: {
          ...current,
          profiles: { ...current.profiles, a: { key: "k", secret: "s", createdAt: "t" } },
        },
      }),
      { maxWaitMs: 100, path },
    );
    expect(r1.success).toBe(true);
    const r2 = updateProfiles(
      (current) => ({
        success: true,
        data: {
          ...current,
          profiles: { ...current.profiles, b: { key: "k", secret: "s", createdAt: "t" } },
        },
      }),
      { maxWaitMs: 100, path },
    );
    expect(r2.success).toBe(true);
    const loaded = loadProfiles(path);
    if (loaded.success) {
      expect(loaded.data.profiles.a).toBeDefined();
      expect(loaded.data.profiles.b).toBeDefined();
    }
  });

  it("releases lock on mutator error (next call can acquire)", () => {
    const r1 = updateProfiles(() => ({ success: false, error: "no", exitCode: 4 }), {
      maxWaitMs: 100,
      path,
    });
    expect(r1.success).toBe(false);
    const r2 = updateProfiles(
      (current) => ({
        success: true,
        data: {
          ...current,
          profiles: { ...current.profiles, ok: { key: "k", secret: "s", createdAt: "t" } },
        },
      }),
      { maxWaitMs: 100, path },
    );
    expect(r2.success).toBe(true);
  });

  it("succeeds on first try when uncontended (single-process compat)", () => {
    const r = updateProfiles(
      (current) => ({
        success: true,
        data: {
          version: 1,
          default: null,
          profiles: { ...current.profiles, mine: { key: "k", secret: "s", createdAt: "t" } },
        },
      }),
      { path },
    );
    expect(r.success).toBe(true);
  });

  it("propagates mutator error without retrying", () => {
    let calls = 0;
    const r = updateProfiles(
      () => {
        calls++;
        return { success: false, error: "validation-failed", exitCode: 4 };
      },
      { path },
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("validation-failed");
    expect(calls).toBe(1);
  });
});
