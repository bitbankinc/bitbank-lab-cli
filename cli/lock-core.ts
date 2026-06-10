// ロック取得コア。profiles-mutate.ts と paper-state-mutate.ts が共有する
// O_EXCL ロックの 1 試行ぶん (tryAcquireOnce) と補助関数を集約する。以前は
// acquireLock が両ファイルにコピペされ（63 行中 59 行が一致）、片方のバグ
// 修正が他方へ伝播せず lost update を招き得た。コアをここへ一本化する。
//
// sync / async を統一しない理由（設計判断・統一禁止）:
// - profiles は直列 CLI 呼び出し。待機は sync sleep (Atomics.wait) が余計な
//   microtask を挟まず event-loop に優しい。
// - paper は Skill / agent 経由で同一プロセス内 Promise.all 並行呼び出しが
//   起き得る。sync sleep だと待機側が event-loop をブロックして lock 保持側の
//   async I/O が進まず starvation する。よって async sleep が必須。
// sleep 戦略だけ各 mutate のループに残す。観測挙動 (5s timeout / 30s stale)
// は現行一致を維持する。
import { closeSync, mkdirSync, openSync, statSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { EXIT } from "./exit-codes.js";
import type { Result } from "./types.js";

export const STALE_LOCK_MS = 30_000;

export type Lock = { release: () => void };

// 1 試行の結果。timeout 判定と sleep は各 mutate のループ側に残すため、ここは
// 4 状態だけ返す:
// - acquired: 取得成功
// - failed:   EEXIST 以外の致命的エラー（Result をそのまま返す）
// - stale:    stale lock を奪取（unlink 済み）→ 即再試行（sleep しない）
// - locked:   他プロセスが保持中 → 呼び出し側で timeout 判定後に sleep
export type AcquireStep =
  | { kind: "acquired"; lock: Lock }
  | { kind: "failed"; result: Result<never> }
  | { kind: "stale" }
  | { kind: "locked" };

export function ensureLockDir(p: string): void {
  try {
    mkdirSync(dirname(p), { recursive: true });
  } catch {
    // mkdir 失敗は openSync で再現させる
  }
}

export function safeUnlink(p: string): void {
  try {
    unlinkSync(p);
  } catch {
    // 既に消えていたら何もしない
  }
}

export function lockTimeout(label: string, maxWaitMs: number): Result<never> {
  return {
    success: false,
    error: `Failed to acquire ${label} within ${maxWaitMs}ms (held by another process)`,
    exitCode: EXIT.GENERAL,
  };
}

export function backoffMs(): number {
  return 5 + Math.floor(Math.random() * 15);
}

export function tryAcquireOnce(p: string, label: string): AcquireStep {
  try {
    closeSync(openSync(p, "wx", 0o600));
    return { kind: "acquired", lock: { release: () => safeUnlink(p) } };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") {
      const msg = e instanceof Error ? e.message : String(e);
      const result: Result<never> = {
        success: false,
        error: `Failed to acquire ${label}: ${msg}`,
        exitCode: EXIT.GENERAL,
      };
      return { kind: "failed", result };
    }
    // 既知の残留レース (TOCTOU / 許容): 複数プロセスが同一ロックを同時に stale
    // 判定すると二重 unlink → 再取得で lost update が起き得る。対象は資金非関与
    // のローカル state のみで、クラッシュ後 30s 経過してから 2 本以上がほぼ同時
    // 競合する単一ユーザ CLI では非現実的なので許容する。
    try {
      if (Date.now() - statSync(p).mtimeMs > STALE_LOCK_MS) {
        safeUnlink(p);
        return { kind: "stale" };
      }
    } catch {
      // stat 失敗（消えた直後など）→ locked 扱いで再試行
    }
    return { kind: "locked" };
  }
}
