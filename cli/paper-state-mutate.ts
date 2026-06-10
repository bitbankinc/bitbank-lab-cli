// paper-state.json への load -> mutate -> save を lock file (O_EXCL) で排他制御
// する。競合する create-order / tick / cancel-order が並行しても lost update や
// 履歴欠落が起きないよう、ファイル単位で直列化する。
// ロック取得コアは lock-core.ts に集約（async sleep を使う理由もそちらに明記）。
import { backoffMs, ensureLockDir, type Lock, lockTimeout, tryAcquireOnce } from "./lock-core.js";
import { defaultStatePath, loadState, type PaperState, saveState } from "./paper-state.js";
import type { Result } from "./types.js";

const DEFAULT_MAX_WAIT_MS = 5_000;

export type StateMutator<T> = (
  state: PaperState | null,
) => Result<{ state: PaperState; result: T }>;

export type UpdateStateOptions = { maxWaitMs?: number; path?: string };

function lockPath(p: string): string {
  return `${p}.lock`;
}

// paper は Skill / agent 経由で同一プロセス内 Promise.all 並行呼び出しも起き得る。
// sync sleep だと待機側が event-loop をブロックし lock 保持側の async I/O が進まず
// starvation するため async sleep を使う（詳細は lock-core.ts ヘッダ）。
function asyncSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireLock(p: string, maxWaitMs: number): Promise<Result<Lock>> {
  ensureLockDir(p);
  const label = "paper state lock";
  const start = Date.now();
  while (true) {
    const step = tryAcquireOnce(p, label);
    if (step.kind === "acquired") return { success: true, data: step.lock };
    if (step.kind === "failed") return step.result;
    if (step.kind === "locked") {
      if (Date.now() - start >= maxWaitMs) return lockTimeout(label, maxWaitMs);
      await asyncSleep(backoffMs());
    }
    // "stale": ロック奪取済み → 即座に再試行（timeout 判定も sleep もしない）
  }
}

export async function updateState<T>(
  mutator: StateMutator<T>,
  options: UpdateStateOptions = {},
): Promise<Result<T>> {
  const path = options.path ?? defaultStatePath();
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const lock = await acquireLock(lockPath(path), maxWaitMs);
  if (!lock.success) return lock;
  try {
    const loaded = await loadState(path);
    if (!loaded.success) return loaded;
    let mutated: Result<{ state: PaperState; result: T }>;
    try {
      mutated = mutator(loaded.data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, error: `paper state mutator threw: ${msg}` };
    }
    if (!mutated.success) return mutated;
    const saved = await saveState(mutated.data.state, path);
    if (!saved.success) return saved;
    return { success: true, data: mutated.data.result };
  } finally {
    lock.data.release();
  }
}
