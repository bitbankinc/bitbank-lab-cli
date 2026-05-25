// 100行超: パストラバーサル防止・symlink 防御・temp+rename atomic write を一箇所に集約
import { randomBytes } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { yearJst, ymdJst } from "./date-utils.js";

const CACHE_BASE = join(homedir(), ".bitbank-cache");
const memCache = new Map<string, unknown>();

/** パストラバーサルを防止: セグメントに / \ .. . を含む場合 null を返す */
function sanitizeSegment(s: string): string | null {
  if (s === "." || /[/\\]|\.\./.test(s) || s.length === 0) return null;
  return s;
}

function cacheKey(pair: string, type: string, date: string): string {
  return `${pair}/${type}/${date}`;
}

function cachePath(pair: string, type: string, date: string): string | null {
  const sp = sanitizeSegment(pair);
  const st = sanitizeSegment(type);
  const sd = sanitizeSegment(date);
  if (!sp || !st || !sd) return null;
  const p = join(CACHE_BASE, sp, st, `${sd}.json`);
  // resolve して CACHE_BASE 配下であることを二重確認
  const resolvedBase = resolve(CACHE_BASE);
  if (!resolve(p).startsWith(resolvedBase + sep)) return null;
  return p;
}

/** シンボリックリンク経由のキャッシュ外アクセスを防止 */
function isSymlinkSafe(filePath: string): boolean {
  try {
    const real = realpathSync(filePath);
    const realBase = realpathSync(CACHE_BASE);
    return real.startsWith(realBase + sep) || real === realBase;
  } catch {
    return false;
  }
}

export function readCache<T>(pair: string, type: string, date: string): T | null {
  const key = cacheKey(pair, type, date);
  const mem = memCache.get(key);
  if (mem !== undefined) return mem as T;

  const p = cachePath(pair, type, date);
  if (!p || !existsSync(p)) return null;
  if (!isSymlinkSafe(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, "utf-8")) as T;
    memCache.set(key, data);
    return data;
  } catch {
    return null;
  }
}

export function writeCache(pair: string, type: string, date: string, data: unknown): void {
  const p = cachePath(pair, type, date);
  if (!p) return;
  memCache.set(cacheKey(pair, type, date), data);
  mkdirSync(join(p, ".."), { recursive: true });
  // 書き込み先がシンボリックリンクなら中止
  if (existsSync(p) && lstatSync(p).isSymbolicLink()) return;
  // temp + rename で atomic に置換（同一 FS 上の inode 差し替え）
  const tmp = `${p}.tmp.${process.pid}.${randomBytes(6).toString("hex")}`;
  try {
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, p);
  } catch (e) {
    // mem は更新済み・ディスクは未更新の齟齬が出るため、失敗を可視化
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`Warning: cache write failed for ${p}: ${msg}\n`);
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

/** テスト用: インメモリキャッシュをクリア */
export function clearMemCache(): void {
  memCache.clear();
}

/** 期間が完了済み（不変データ）ならキャッシュ対象。JST 基準で比較する */
export function isCompletePeriod(date: string): boolean {
  const now = new Date();
  if (date.length === 4) {
    return Number(date) < Number(yearJst(now.getTime()));
  }
  return date < ymdJst(now.getTime());
}
