// lock-core の取得プリミティブ単体テスト。retry-loop の結合検証は
// profile/concurrent・paper/concurrent・paper/state-mutate 側にあるので、
// ここは tryAcquireOnce の 4 分岐（acquired / failed / stale / locked）と
// 補助関数（ensureLockDir / safeUnlink / lockTimeout / backoffMs）を直接突く。
import { closeSync, existsSync, mkdtempSync, openSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT } from "../exit-codes.js";
import {
  backoffMs,
  ensureLockDir,
  lockTimeout,
  STALE_LOCK_MS,
  safeUnlink,
  tryAcquireOnce,
} from "../lock-core.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lock-core-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("tryAcquireOnce", () => {
  it("acquires a free lock; release() removes the file and is idempotent", () => {
    const p = join(dir, "x.lock");
    const step = tryAcquireOnce(p, "test lock");
    expect(step.kind).toBe("acquired");
    expect(existsSync(p)).toBe(true);
    if (step.kind !== "acquired") return;
    step.lock.release();
    expect(existsSync(p)).toBe(false);
    // 既に消えていても release は throw しない
    expect(() => step.lock.release()).not.toThrow();
  });

  it("EEXIST + fresh lock → 'locked' (retry), keeps the lock file", () => {
    const p = join(dir, "x.lock");
    closeSync(openSync(p, "wx", 0o600));
    const now = Date.now() / 1000;
    utimesSync(p, now, now);
    const step = tryAcquireOnce(p, "test lock");
    expect(step.kind).toBe("locked");
    expect(existsSync(p)).toBe(true);
  });

  it("EEXIST + stale lock (mtime past TTL) → 'stale', unlinks then re-acquires", () => {
    const p = join(dir, "x.lock");
    closeSync(openSync(p, "wx", 0o600));
    const past = (Date.now() - (STALE_LOCK_MS + 30_000)) / 1000;
    utimesSync(p, past, past);
    const step = tryAcquireOnce(p, "test lock");
    expect(step.kind).toBe("stale");
    expect(existsSync(p)).toBe(false);
    // 奪取後の次試行で取得できる
    expect(tryAcquireOnce(p, "test lock").kind).toBe("acquired");
  });

  it("non-EEXIST open failure → 'failed' Result (no throw)", () => {
    const p = join(dir, "missing-subdir", "x.lock"); // 親 dir が無い → ENOENT
    const step = tryAcquireOnce(p, "test lock");
    expect(step.kind).toBe("failed");
    if (step.kind !== "failed" || step.result.success) return;
    expect(step.result.error).toContain("Failed to acquire test lock");
    expect(step.result.error).not.toMatch(/within/); // timeout 文言ではない
    expect(step.result.exitCode).toBe(EXIT.GENERAL);
  });
});

describe("lockTimeout", () => {
  it("returns a Result error with label, wait, and exit code", () => {
    const r = lockTimeout("paper state lock", 123);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error).toContain("paper state lock");
    expect(r.error).toContain("123ms");
    expect(r.error).toContain("held by another process");
    expect(r.exitCode).toBe(EXIT.GENERAL);
  });
});

describe("ensureLockDir / safeUnlink", () => {
  it("ensureLockDir creates the parent dir so a later acquire succeeds", () => {
    const p = join(dir, "nested", "deep", "x.lock");
    ensureLockDir(p);
    expect(tryAcquireOnce(p, "test lock").kind).toBe("acquired");
  });

  it("ensureLockDir is a no-op (no throw) when the dir already exists", () => {
    const p = join(dir, "x.lock");
    expect(() => ensureLockDir(p)).not.toThrow();
    expect(() => ensureLockDir(p)).not.toThrow();
  });

  it("safeUnlink removes an existing file and no-ops on a missing one", () => {
    const p = join(dir, "x.lock");
    closeSync(openSync(p, "wx", 0o600));
    safeUnlink(p);
    expect(existsSync(p)).toBe(false);
    expect(() => safeUnlink(p)).not.toThrow();
  });
});

describe("constants and backoff", () => {
  it("STALE_LOCK_MS is 30s", () => {
    expect(STALE_LOCK_MS).toBe(30_000);
  });

  it("backoffMs returns an integer within [5, 19]", () => {
    for (let i = 0; i < 100; i++) {
      const ms = backoffMs();
      expect(Number.isInteger(ms)).toBe(true);
      expect(ms).toBeGreaterThanOrEqual(5);
      expect(ms).toBeLessThanOrEqual(19);
    }
  });
});
