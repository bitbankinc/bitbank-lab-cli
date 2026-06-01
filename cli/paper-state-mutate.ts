// 100行超: paper-state.json への load -> mutate -> save を lock file (O_EXCL)
// で排他制御する。profiles-mutate.ts と同じ方式（node:fs の openSync 'wx'）。
// 競合する create-order / tick / cancel-order が並行しても lost update や
// 履歴欠落が起きないよう、ファイル単位で直列化する。
// stale lock は mtime しきい値で自動クリーンアップする。
import { closeSync, mkdirSync, openSync, statSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { EXIT } from "./exit-codes.js";
import { type PaperState, defaultStatePath, loadState, saveState } from "./paper-state.js";
import type { Result } from "./types.js";

const DEFAULT_MAX_WAIT_MS = 5_000;
const STALE_LOCK_MS = 30_000;

export type StateMutator<T> = (
  state: PaperState | null,
) => Result<{ state: PaperState; result: T }>;

export type UpdateStateOptions = { maxWaitMs?: number; path?: string };

function lockPath(p: string): string {
  return `${p}.lock`;
}

// profile 側は sync sleep（Atomics.wait）だが、paper は Skill / agent 経由で
// 同一プロセス内の Promise.all 並行呼び出しも起き得る。sync sleep だと
// 待機側が event-loop をブロックして lock 保持側の async I/O が進まず
// starvation するので、ここでは setTimeout ベースの async sleep を使う。
// 観測可能な挙動（5s timeout / 30s stale TTL）は profiles-mutate.ts と一致。
function asyncSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Lock = { release: () => void };

async function acquireLock(p: string, maxWaitMs: number): Promise<Result<Lock>> {
  try {
    mkdirSync(dirname(p), { recursive: true });
  } catch {
    // mkdir 失敗は openSync で再現させる
  }
  const start = Date.now();
  while (true) {
    try {
      const fd = openSync(p, "wx", 0o600);
      closeSync(fd);
      return {
        success: true,
        data: {
          release: () => {
            try {
              unlinkSync(p);
            } catch {
              // 既に消えていたら何もしない
            }
          },
        },
      };
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          success: false,
          error: `Failed to acquire paper state lock: ${msg}`,
          exitCode: EXIT.GENERAL,
        };
      }
      // 既知の残留レース（TOCTOU / 許容）: 複数プロセスが同一ロックを同時に
      // stale 判定すると、二重に unlink → 再取得して lost update が起き得る。
      // トークン照合 + O_EXCL 再取得で窓を最小化でき、単一ホスト通常運用なら
      // 実用上防げる（完全な分散ロックにはしない）が、対象は資金非関与の
      // ローカル state のみで、前プロセスのクラッシュ後 30s 経過してから 2 本
      // 以上がほぼ同時競合する単一ユーザ CLI では非現実的なので許容する。
      try {
        const age = Date.now() - statSync(p).mtimeMs;
        if (age > STALE_LOCK_MS) {
          try {
            unlinkSync(p);
          } catch {
            // 既に他プロセスが消していたら何もしない（上記残留レース）
          }
          continue;
        }
      } catch {
        // stat 失敗（消えた直後など）→ retry
      }
      if (Date.now() - start >= maxWaitMs) {
        return {
          success: false,
          error: `Failed to acquire paper state lock within ${maxWaitMs}ms (held by another process)`,
          exitCode: EXIT.GENERAL,
        };
      }
      await asyncSleep(5 + Math.floor(Math.random() * 15));
    }
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
