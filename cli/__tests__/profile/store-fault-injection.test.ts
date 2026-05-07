// 100行超: profiles.json の atomic write (tmp → fsync → rename) を fault injection で検証。
// paper-state 側の同等テストと対になる位置づけで、sync 版 node:fs を mock する。
// 検証観点: 書き込み中の throw / partial write / rename 直前 crash で本体が壊れないこと、
// および失敗時に secret 平文を含む tmp が cleanup されること（残る場合は 0600 であること）。
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ProfilesFile,
  emptyProfilesFile,
  loadProfiles,
  saveProfiles,
} from "../../profiles-store.js";

const mockFlags = {
  writeThrows: false,
  fsyncThrows: false,
  renameThrows: false,
  unlinkThrows: false,
};

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    writeSync: ((...args: Parameters<typeof actual.writeSync>) => {
      if (mockFlags.writeThrows) throw new Error("simulated writeSync failure");
      return (actual.writeSync as (...a: typeof args) => number)(...args);
    }) as typeof actual.writeSync,
    fsyncSync: (fd: number) => {
      if (mockFlags.fsyncThrows) throw new Error("simulated fsyncSync failure");
      return actual.fsyncSync(fd);
    },
    renameSync: (src: string, dst: string) => {
      if (mockFlags.renameThrows) throw new Error("simulated renameSync failure");
      return actual.renameSync(src, dst);
    },
    unlinkSync: (path: string) => {
      if (mockFlags.unlinkThrows) throw new Error("simulated unlinkSync failure");
      return actual.unlinkSync(path);
    },
  };
});

let dir: string;
let path: string;

function fileWithSecret(secret = "TOPSECRET-PLAINTEXT"): ProfilesFile {
  return {
    version: 1,
    default: "main",
    profiles: {
      main: { key: "K", secret, description: "main acct", createdAt: "2026-01-01T00:00:00.000Z" },
    },
  };
}

function listTmps(): string[] {
  return readdirSync(dir).filter((f) => f.endsWith(".tmp"));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "profiles-fault-"));
  path = join(dir, "profiles.json");
  mockFlags.writeThrows = false;
  mockFlags.fsyncThrows = false;
  mockFlags.renameThrows = false;
  mockFlags.unlinkThrows = false;
});

afterEach(() => {
  // chmod everything 0700 first so rmSync can clean possibly-0600 leftovers
  for (const f of readdirSync(dir)) {
    try {
      chmodSync(join(dir, f), 0o600);
    } catch {
      // ignore
    }
  }
  rmSync(dir, { recursive: true, force: true });
});

describe("profiles-store atomic write: fault injection", () => {
  it("writeSync throws → target untouched, no .tmp leftover, Result.success=false", () => {
    saveProfiles(fileWithSecret("ORIGINAL"), path);
    const before = readFileSync(path, "utf-8");

    mockFlags.writeThrows = true;
    const r = saveProfiles(fileWithSecret("REPLACEMENT"), path);
    expect(r.success).toBe(false);

    expect(readFileSync(path, "utf-8")).toBe(before);
    expect(listTmps()).toEqual([]);
  });

  it("fsyncSync throws (partial write, pre-durability) → target untouched, no .tmp leftover", () => {
    saveProfiles(fileWithSecret("ORIGINAL"), path);
    const before = readFileSync(path, "utf-8");

    mockFlags.fsyncThrows = true;
    const r = saveProfiles(fileWithSecret("MUTATED"), path);
    expect(r.success).toBe(false);

    expect(readFileSync(path, "utf-8")).toBe(before);
    expect(listTmps()).toEqual([]);
  });

  it("renameSync throws (crash just before atomic swap) → target untouched, tmp cleaned up", () => {
    saveProfiles(fileWithSecret("ORIGINAL"), path);
    const before = readFileSync(path, "utf-8");

    mockFlags.renameThrows = true;
    const r = saveProfiles(fileWithSecret("REPLACEMENT"), path);
    expect(r.success).toBe(false);

    expect(readFileSync(path, "utf-8")).toBe(before);
    expect(listTmps()).toEqual([]);
  });

  it("first save (no pre-existing target): writeSync throws → no profiles.json created, no .tmp leftover", () => {
    mockFlags.writeThrows = true;
    const r = saveProfiles(fileWithSecret("FIRST"), path);
    expect(r.success).toBe(false);

    const remaining = readdirSync(dir);
    expect(remaining).toEqual([]);
  });

  it("first save: rename throws → no profiles.json created, tmp cleaned up", () => {
    mockFlags.renameThrows = true;
    const r = saveProfiles(fileWithSecret("FIRST"), path);
    expect(r.success).toBe(false);

    expect(readdirSync(dir)).toEqual([]);
  });

  it("save still recovers cleanly when next save succeeds after a failed one", () => {
    saveProfiles(fileWithSecret("V1"), path);
    mockFlags.renameThrows = true;
    saveProfiles(fileWithSecret("V2-FAILS"), path);
    mockFlags.renameThrows = false;

    const r = saveProfiles(fileWithSecret("V3"), path);
    expect(r.success).toBe(true);

    const loaded = loadProfiles(path);
    expect(loaded.success).toBe(true);
    if (loaded.success) {
      expect(loaded.data.profiles.main?.secret).toBe("V3");
    }
    expect(listTmps()).toEqual([]);
  });

  it("secret never leaks: even if cleanup unlinkSync also fails, surviving tmp is 0600", () => {
    // 失敗パスで unlink 自体も落ちると tmp が残る。実装は catch 内で unlink 失敗を
    // 黙って飲むため、その worst case で secret 平文を含む tmp が world-readable に
    // ならないことを担保する。
    mockFlags.renameThrows = true;
    mockFlags.unlinkThrows = true;
    const r = saveProfiles(fileWithSecret("SHOULD-NOT-LEAK"), path);
    expect(r.success).toBe(false);

    const tmps = listTmps();
    if (tmps.length > 0) {
      for (const t of tmps) {
        const mode = statSync(join(dir, t)).mode & 0o777;
        expect(mode).toBe(0o600);
      }
    }
  });

  it("loadProfiles ignores a stray .tmp left from a prior crash", () => {
    saveProfiles(emptyProfilesFile(), path);
    // Pretend a prior process crashed mid-write and left an unrelated tmp behind.
    // loadProfiles must still read the canonical file without confusion.
    const stray = `${path}.99999.deadbeef.tmp`;
    writeFileSync(stray, "{not valid json");

    const r = loadProfiles(path);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual(emptyProfilesFile());
  });
});
