// profiles.json への CRUD を排他制御で直列化し、TOCTOU 競合を解消する。
// 設計選択: ロックファイル（O_EXCL）方式。検討した楽観ロック（read 時 hash と
// 書き込み直前 hash の CAS）では save 後の post-check と他プロセスの rename の
// 間に窓が残り、last-writer-wins 残留を排除しきれないため採らない。
// ロック取得コアは lock-core.ts に集約（sync sleep を使う理由もそちらに明記）。
import { backoffMs, ensureLockDir, type Lock, lockTimeout, tryAcquireOnce } from "./lock-core.js";
import {
  defaultProfilesPath,
  loadProfiles,
  type ProfilesFile,
  saveProfiles,
} from "./profiles-store.js";
import type { Result } from "./types.js";

const DEFAULT_MAX_WAIT_MS = 5_000;

export type Mutator = (current: ProfilesFile) => Result<ProfilesFile>;
export type UpdateProfilesOptions = { maxWaitMs?: number; path?: string };

function lockPath(p: string): string {
  return `${p}.lock`;
}

function syncSleep(ms: number): void {
  // 同期スリープ。busy-wait より event-loop に優しい
  const ia = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(ia, 0, 0, ms);
}

function acquireLock(p: string, maxWaitMs: number): Result<Lock> {
  ensureLockDir(p);
  const label = "profiles lock";
  const start = Date.now();
  while (true) {
    const step = tryAcquireOnce(p, label);
    if (step.kind === "acquired") return { success: true, data: step.lock };
    if (step.kind === "failed") return step.result;
    if (step.kind === "locked") {
      if (Date.now() - start >= maxWaitMs) return lockTimeout(label, maxWaitMs);
      syncSleep(backoffMs());
    }
    // "stale": ロック奪取済み → 即座に再試行（timeout 判定も sleep もしない）
  }
}

export function updateProfiles(
  mutator: Mutator,
  options: UpdateProfilesOptions = {},
): Result<{ saved: true }> {
  const path = options.path ?? defaultProfilesPath();
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const lock = acquireLock(lockPath(path), maxWaitMs);
  if (!lock.success) return lock;
  try {
    const loaded = loadProfiles(path);
    if (!loaded.success) return loaded;
    const mutated = mutator(loaded.data);
    if (!mutated.success) return mutated;
    const saved = saveProfiles(mutated.data, path);
    if (!saved.success) return saved;
    return { success: true, data: { saved: true } };
  } finally {
    lock.data.release();
  }
}
