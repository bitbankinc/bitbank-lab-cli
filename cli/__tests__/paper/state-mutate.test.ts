// 100行超: updateState の lock セマンティクスを単体検証する。
// - lock 取得失敗時に Result error（throw しない）
// - mutator が例外を投げても lock が解放される
// - stale lock の境界テスト（TTL 超過時のテイクオーバー）
// - mutator が Result.error を返したときの lock 解放
import { closeSync, mkdtempSync, openSync, rmSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadState, type PaperState, saveState } from "../../paper-state.js";
import { updateState } from "../../paper-state-mutate.js";

let dir: string;
let statePath: string;
let lockPath: string;

function makeState(overrides: Partial<PaperState> = {}): PaperState {
  return {
    version: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    initialJpy: 1_000_000,
    balances: { jpy: 1_000_000 },
    history: [],
    lastTickAt: "2026-01-01T00:00:00.000Z",
    openOrders: [],
    ...overrides,
  };
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "paper-mutate-"));
  statePath = join(dir, "paper-state.json");
  lockPath = `${statePath}.lock`;
  await saveState(makeState(), statePath);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("updateState lock semantics", () => {
  it("returns Result.error on lock timeout (no throw)", async () => {
    closeSync(openSync(lockPath, "wx", 0o600));
    try {
      const r = await updateState<{ ok: true }>(
        (state) => {
          if (!state) return { success: false, error: "no state" };
          return {
            success: true,
            data: { state: { ...state, initialJpy: 999 }, result: { ok: true } },
          };
        },
        { maxWaitMs: 100, path: statePath },
      );
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error).toMatch(/lock/i);
    } finally {
      rmSync(lockPath, { force: true });
    }
  });

  it("releases lock on success (next call can acquire)", async () => {
    const r1 = await updateState<{ ok: true }>(
      (state) => {
        if (!state) return { success: false, error: "no state" };
        return {
          success: true,
          data: { state: { ...state, initialJpy: 111 }, result: { ok: true } },
        };
      },
      { maxWaitMs: 100, path: statePath },
    );
    expect(r1.success).toBe(true);
    const r2 = await updateState<{ ok: true }>(
      (state) => {
        if (!state) return { success: false, error: "no state" };
        return {
          success: true,
          data: { state: { ...state, initialJpy: 222 }, result: { ok: true } },
        };
      },
      { maxWaitMs: 100, path: statePath },
    );
    expect(r2.success).toBe(true);
    const loaded = await loadState(statePath);
    expect(loaded.success).toBe(true);
    if (!loaded.success || !loaded.data) return;
    expect(loaded.data.initialJpy).toBe(222);
  });

  it("releases lock on mutator-returned error (next call can acquire)", async () => {
    const r1 = await updateState(() => ({ success: false as const, error: "validation failed" }), {
      maxWaitMs: 100,
      path: statePath,
    });
    expect(r1.success).toBe(false);
    if (!r1.success) expect(r1.error).toBe("validation failed");
    const r2 = await updateState<{ ok: true }>(
      (state) => {
        if (!state) return { success: false, error: "no state" };
        return {
          success: true,
          data: { state: { ...state, initialJpy: 555 }, result: { ok: true } },
        };
      },
      { maxWaitMs: 100, path: statePath },
    );
    expect(r2.success).toBe(true);
  });

  it("releases lock when mutator throws synchronously", async () => {
    const r1 = await updateState(
      () => {
        throw new Error("boom");
      },
      { maxWaitMs: 100, path: statePath },
    );
    expect(r1.success).toBe(false);
    if (!r1.success) expect(r1.error).toMatch(/boom/);
    // lock should be released; next call must succeed
    const r2 = await updateState<{ ok: true }>(
      (state) => {
        if (!state) return { success: false, error: "no state" };
        return {
          success: true,
          data: { state: { ...state, initialJpy: 777 }, result: { ok: true } },
        };
      },
      { maxWaitMs: 100, path: statePath },
    );
    expect(r2.success).toBe(true);
  });

  it("takes over a stale lock (mtime older than TTL)", async () => {
    closeSync(openSync(lockPath, "wx", 0o600));
    // backdate the lockfile mtime past the 30s stale threshold
    const past = (Date.now() - 60_000) / 1000;
    utimesSync(lockPath, past, past);
    const r = await updateState<{ ok: true }>(
      (state) => {
        if (!state) return { success: false, error: "no state" };
        return {
          success: true,
          data: { state: { ...state, initialJpy: 4242 }, result: { ok: true } },
        };
      },
      { maxWaitMs: 200, path: statePath },
    );
    expect(r.success).toBe(true);
    const loaded = await loadState(statePath);
    expect(loaded.success).toBe(true);
    if (!loaded.success || !loaded.data) return;
    expect(loaded.data.initialJpy).toBe(4242);
  });

  it("does not take over a fresh lock (mtime within TTL)", async () => {
    closeSync(openSync(lockPath, "wx", 0o600));
    // fresh lock; ensure mtime is near now
    const now = Date.now() / 1000;
    utimesSync(lockPath, now, now);
    try {
      const r = await updateState(
        (state) => {
          if (!state) return { success: false, error: "no state" };
          return { success: true, data: { state, result: { ok: true } } };
        },
        { maxWaitMs: 100, path: statePath },
      );
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error).toMatch(/lock/i);
      // lock file must still exist (we did not take it over)
      expect(() => statSync(lockPath)).not.toThrow();
    } finally {
      rmSync(lockPath, { force: true });
    }
  });

  it("propagates mutator error without calling it again", async () => {
    let calls = 0;
    const r = await updateState(
      () => {
        calls++;
        return { success: false as const, error: "single shot" };
      },
      { maxWaitMs: 100, path: statePath },
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("single shot");
    expect(calls).toBe(1);
  });
});

describe("updateState with uninitialized state", () => {
  it("passes null to mutator when no state file exists", async () => {
    rmSync(statePath, { force: true });
    let received: PaperState | null | undefined;
    const r = await updateState<{ ok: true }>(
      (state) => {
        received = state;
        const fresh = makeState({ initialJpy: 12345 });
        return { success: true, data: { state: fresh, result: { ok: true } } };
      },
      { maxWaitMs: 100, path: statePath },
    );
    expect(r.success).toBe(true);
    expect(received).toBeNull();
    const loaded = await loadState(statePath);
    expect(loaded.success).toBe(true);
    if (!loaded.success || !loaded.data) return;
    expect(loaded.data.initialJpy).toBe(12345);
  });
});
