// 100行超: profiles.json への CRUD を排他制御で直列化し、TOCTOU 競合を解消する。
// 設計選択: ロックファイル（O_EXCL）方式。
//
// 検討した楽観ロック（read 時 hash と書き込み直前 hash の CAS）では、
// save 後の post-check と他プロセスの rename の間に常に窓が残り、
// 「自分が成功と返したのに直後に上書きされる last-writer-wins 残留」を
// 完全には排除できない。そのため、ロックファイル方式に切り替えた。
// node:fs の openSync(..., 'wx') が atomic な O_EXCL をくれるため
// 外部依存は不要。stale lock は mtime しきい値で自動クリーンアップする。
import { closeSync, mkdirSync, openSync, statSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { EXIT } from "./exit-codes.js";
import {
  type ProfilesFile,
  defaultProfilesPath,
  loadProfiles,
  saveProfiles,
} from "./profiles-store.js";
import type { Result } from "./types.js";

const DEFAULT_MAX_WAIT_MS = 5_000;
const STALE_LOCK_MS = 30_000;

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

type Lock = { release: () => void };

function acquireLock(p: string, maxWaitMs: number): Result<Lock> {
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
          error: `Failed to acquire profiles lock: ${msg}`,
          exitCode: EXIT.GENERAL,
        };
      }
      try {
        const age = Date.now() - statSync(p).mtimeMs;
        if (age > STALE_LOCK_MS) {
          try {
            unlinkSync(p);
          } catch {
            // race ok
          }
          continue;
        }
      } catch {
        // stat 失敗（消えた直後など）→ retry
      }
      if (Date.now() - start >= maxWaitMs) {
        return {
          success: false,
          error: `Failed to acquire profiles lock within ${maxWaitMs}ms (held by another process)`,
          exitCode: EXIT.GENERAL,
        };
      }
      syncSleep(5 + Math.floor(Math.random() * 15));
    }
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
