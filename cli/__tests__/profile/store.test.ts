// 100行超: profiles.json の I/O・schema・permission 警告・last-write-wins を 1 ファイルに集約
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyProfilesFile,
  loadProfiles,
  type ProfilesFile,
  saveProfiles,
} from "../../profiles-store.js";

describe("profiles-store: empty + load/save", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "profile-store-"));
    path = join(dir, "profiles.json");
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("loadProfiles returns empty file when ENOENT", () => {
    const r = loadProfiles(path);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual(emptyProfilesFile());
    }
  });

  it("saveProfiles + loadProfiles round-trips", () => {
    const file: ProfilesFile = {
      version: 1,
      default: "main",
      profiles: {
        main: { key: "k", secret: "s", description: "d", createdAt: "2024-01-01T00:00:00.000Z" },
      },
    };
    expect(saveProfiles(file, path).success).toBe(true);
    const r = loadProfiles(path);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual(file);
  });

  it("saveProfiles writes file with mode 0600", () => {
    const file = emptyProfilesFile();
    saveProfiles(file, path);
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("saveProfiles rejects invalid file shape", () => {
    const bad = { version: 2, default: null, profiles: {} } as unknown as ProfilesFile;
    const r = saveProfiles(bad, path);
    expect(r.success).toBe(false);
  });

  it("loadProfiles errors on schema mismatch", () => {
    writeFileSync(path, JSON.stringify({ version: 99 }));
    chmodSync(path, 0o600);
    const r = loadProfiles(path);
    expect(r.success).toBe(false);
  });

  it("loadProfiles errors on invalid JSON", () => {
    writeFileSync(path, "{not json");
    chmodSync(path, 0o600);
    const r = loadProfiles(path);
    expect(r.success).toBe(false);
  });

  it("loadProfiles warns on insecure permissions (0644) but still loads", () => {
    saveProfiles(emptyProfilesFile(), path);
    chmodSync(path, 0o644);
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const r = loadProfiles(path);
    expect(r.success).toBe(true);
    const warned = spy.mock.calls.some((c) => String(c[0]).includes("readable by other users"));
    expect(warned).toBe(true);
    spy.mockRestore();
  });

  // 注: tmp+rename の atomicity 自体はここでは検証しない。fault injection や
  // 並列レースは別 suite を立てる必要がある。ここは last-write-wins の
  // セマンティクス（途中で torn ファイルが残らない）だけを確認する
  it("saveProfiles last-write-wins (sequential)", () => {
    saveProfiles(
      {
        version: 1,
        default: null,
        profiles: { a: { key: "k", secret: "s", createdAt: "t" } },
      },
      path,
    );
    saveProfiles(
      {
        version: 1,
        default: null,
        profiles: { b: { key: "k2", secret: "s2", createdAt: "t" } },
      },
      path,
    );
    expect(existsSync(path)).toBe(true);
    const final = JSON.parse(readFileSync(path, "utf-8")) as ProfilesFile;
    // 後勝ちで b が残る
    expect(Object.keys(final.profiles)).toEqual(["b"]);
  });
});
