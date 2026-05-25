import { nextBoundaryMs } from "../../date-utils.js";
import type { Gap, ResultMeta } from "../../types.js";
import type { Candle } from "./candles-fetch.js";

export function normalizeCandles(rows: Candle[]): { rows: Candle[]; dedupedCount: number } {
  const sorted = [...rows].sort((a, b) => a.timestamp - b.timestamp);
  const seen = new Set<number>();
  const out: Candle[] = [];
  let dups = 0;
  for (const c of sorted) {
    if (seen.has(c.timestamp)) {
      dups++;
      continue;
    }
    seen.add(c.timestamp);
    out.push(c);
  }
  return { rows: out, dedupedCount: dups };
}

// 1month は暦依存（28〜31 日）で固定 step が使えないため、nextBoundaryMs を辿って
// 隣接ローソク間に挟まる境界の数を数える。固定幅 type も同じロジックに乗る。
export function detectGaps(rows: Candle[], type: string): Gap[] {
  const gaps: Gap[] = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].timestamp;
    const curr = rows[i].timestamp;
    let cursor = nextBoundaryMs(type, prev);
    if (cursor === 0) continue;
    let missing = 0;
    while (cursor < curr) {
      missing++;
      const next = nextBoundaryMs(type, cursor);
      if (next === 0 || next <= cursor) break;
      cursor = next;
    }
    if (missing > 0) gaps.push({ from: prev, to: curr, missing });
  }
  return gaps;
}

/** 末尾の足が未確定（次の境界がまだ来ていない）かを判定。空配列・未知 type は false */
export function detectLastIncomplete(rows: Candle[], type: string, nowMs?: number): boolean {
  if (rows.length === 0) return false;
  const end = nextBoundaryMs(type, rows[rows.length - 1].timestamp);
  if (end === 0) return false;
  return end > (nowMs ?? Date.now());
}

export function augmentMeta(
  dedupedCount: number,
  gaps: Gap[],
  baseMeta?: ResultMeta,
  lastIsIncomplete?: boolean,
): ResultMeta | undefined {
  const hasDeduped = dedupedCount > 0;
  const hasGaps = gaps.length > 0;
  const hasIncomplete = !!lastIsIncomplete;
  if (!hasDeduped && !hasGaps && !hasIncomplete) return baseMeta;
  const meta: ResultMeta = { ...(baseMeta ?? {}) };
  if (hasDeduped) meta.dedupedCount = dedupedCount;
  if (hasGaps) meta.gaps = gaps;
  if (hasIncomplete) meta.lastIsIncomplete = true;
  return meta;
}
