// 100行超: updateProfiles の retry-loop と atomic write 失敗の合わせ技を検証する。
// PR 1 の fault-injection 基盤を流用し、saveProfiles が落ちても本体が壊れないこと、
// および error が Result で返ること（throw 禁止）を確認する。
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateProfiles } from "../../profiles-mutate.js";
import { loadProfiles, type ProfilesFile, saveProfiles } from "../../profiles-store.js";

const mockFlags = {
  renameThrows: false,
};

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    renameSync: (src: string, dst: string) => {
      if (mockFlags.renameThrows) throw new Error("simulated renameSync failure");
      return actual.renameSync(src, dst);
    },
  };
});

let dir: string;
let path: string;

const ORIGINAL: ProfilesFile = {
  version: 1,
  default: "main",
  profiles: { main: { key: "K", secret: "S-ORIGINAL", createdAt: "2026-01-01T00:00:00.000Z" } },
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "profile-mutate-fault-"));
  path = join(dir, "profiles.json");
  saveProfiles(ORIGINAL, path);
  mockFlags.renameThrows = false;
});

afterEach(() => {
  mockFlags.renameThrows = false;
  rmSync(dir, { recursive: true, force: true });
});

describe("updateProfiles + atomic write fault injection", () => {
  it("rename failure during retry → file body intact, Result.error", () => {
    const before = readFileSync(path, "utf-8");
    mockFlags.renameThrows = true;
    const r = updateProfiles(
      (current) => ({
        success: true,
        data: {
          ...current,
          profiles: {
            ...current.profiles,
            sub: { key: "K2", secret: "S-NEW", createdAt: "2026-02-01T00:00:00.000Z" },
          },
        },
      }),
      { maxWaitMs: 100, path },
    );
    expect(r.success).toBe(false);
    // 本体が壊れていない（loadProfiles が schema を通る）
    expect(readFileSync(path, "utf-8")).toBe(before);
    const loaded = loadProfiles(path);
    expect(loaded.success).toBe(true);
    if (loaded.success) expect(loaded.data.profiles.main?.secret).toBe("S-ORIGINAL");
    // 失敗パスでも .tmp が残らない
    const tmps = readdirSync(dir).filter((f) => f.endsWith(".tmp"));
    expect(tmps).toEqual([]);
  });

  it("recovers on next call once fault clears", () => {
    mockFlags.renameThrows = true;
    const r1 = updateProfiles(
      (current) => ({
        success: true,
        data: {
          ...current,
          profiles: {
            ...current.profiles,
            sub: { key: "K2", secret: "S-NEW", createdAt: "t" },
          },
        },
      }),
      { maxWaitMs: 100, path },
    );
    expect(r1.success).toBe(false);

    mockFlags.renameThrows = false;
    const r2 = updateProfiles(
      (current) => ({
        success: true,
        data: {
          ...current,
          profiles: {
            ...current.profiles,
            sub: { key: "K2", secret: "S-NEW", createdAt: "t" },
          },
        },
      }),
      { maxWaitMs: 100, path },
    );
    expect(r2.success).toBe(true);
    const loaded = loadProfiles(path);
    if (loaded.success) expect(loaded.data.profiles.sub).toBeDefined();
  });
});
