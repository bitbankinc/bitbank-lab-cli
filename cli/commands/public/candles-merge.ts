import type { Gap, ResultMeta } from "../../types.js";
import type { Candle } from "./candles-fetch.js";

// sub-daily の step（ms）。YEARLY_TYPES（4hour 以降）は暦依存なので含めない
const STEP_MS: Record<string, number> = {
  "1min": 60_000,
  "5min": 300_000,
  "15min": 900_000,
  "30min": 1_800_000,
  "1hour": 3_600_000,
};

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

export function detectGaps(rows: Candle[], type: string): Gap[] {
  const step = STEP_MS[type];
  if (!step) return [];
  const gaps: Gap[] = [];
  for (let i = 1; i < rows.length; i++) {
    const delta = rows[i].timestamp - rows[i - 1].timestamp;
    if (delta > step) {
      gaps.push({
        from: rows[i - 1].timestamp,
        to: rows[i].timestamp,
        missing: delta / step - 1,
      });
    }
  }
  return gaps;
}

export function augmentMeta(
  dedupedCount: number,
  gaps: Gap[],
  baseMeta?: ResultMeta,
): ResultMeta | undefined {
  const hasDeduped = dedupedCount > 0;
  const hasGaps = gaps.length > 0;
  if (!hasDeduped && !hasGaps) return baseMeta;
  const meta: ResultMeta = { ...(baseMeta ?? {}) };
  if (hasDeduped) meta.dedupedCount = dedupedCount;
  if (hasGaps) meta.gaps = gaps;
  return meta;
}
