// paper の信用で使うペアごとのパラメータを pairs から引く（ADR-010 決定 3 / docs/dev/paper-margin-plan.md §3.4）。
// 1 ペアずつの判定は paper-margin/params.ts（純関数）。ここは取得の順序だけを持つ:
// - リスク想定比率が適用期限切れ（stale）なら pairs を 1 度だけ取り直す（キャッシュの TTL 24h より比率の週次切替が先に来る）
// - 信用非対応・フィールド欠落・取り直しても期限切れのペアは、最後に読めた控え（state の margin.lastParams）が
//   あればそれを使い、fallbacks で申告する。控えも無ければ失敗（黙って既定値で埋めない）。
//   控えが無いと、取扱終了などで読めなくなったペアの建玉を評価も返済もできず、口座が固まるため。
//   控えを使うペアは新規建てを止める（stopNewLong / stopNewShort を立てる。返済だけ通す）
// - pairs の取得自体の失敗は控えで埋めない（一時的な失敗は次の tick で取り直す）
import type { CachedPair } from "./pairs-cache.js";
import { type MarginPairParams, marginParamsOf } from "./paper-margin/params.js";
import type { Result } from "./types.js";

type GetPairs = () => Promise<Result<CachedPair[]>>;

export type ResolvedMarginParams = {
  params: Map<string, MarginPairParams>;
  /** 控え（last-known）を使ったペア */
  fallbacks: string[];
};

export async function resolveMarginParams(
  pairs: readonly string[],
  o: {
    nowMs: number;
    getPairs: GetPairs;
    refreshPairs: GetPairs;
    lastKnown?: Readonly<Record<string, MarginPairParams>>;
  },
): Promise<Result<ResolvedMarginParams>> {
  let source = await o.getPairs();
  for (let attempt = 0; ; attempt++) {
    if (!source.success)
      return { success: false, error: `margin: fetch pairs failed: ${source.error}` };
    const byName = new Map(source.data.map((p) => [p.name, p] as const));
    const out = new Map<string, MarginPairParams>();
    const unreadable = new Map<string, string>();
    const stale: string[] = [];
    for (const pair of pairs) {
      const info = byName.get(pair);
      const r = info
        ? marginParamsOf(info, o.nowMs)
        : { kind: "unknown" as const, reason: "not in pairs" };
      if (r.kind === "ok") out.set(pair, r.params);
      else if (r.kind === "stale") stale.push(pair);
      else unreadable.set(pair, r.kind === "unknown" ? r.reason : "margin not supported");
    }
    if (stale.length > 0 && attempt === 0) {
      source = await o.refreshPairs();
      continue;
    }
    for (const pair of stale)
      unreadable.set(pair, "risk ratio is past its until even after refresh");
    const fallbacks: string[] = [];
    const problems: string[] = [];
    for (const [pair, why] of unreadable) {
      const kept = o.lastKnown?.[pair];
      if (!kept) {
        problems.push(`${pair} (${why})`);
        continue;
      }
      out.set(pair, lastKnownParams(kept));
      fallbacks.push(pair);
    }
    if (problems.length > 0) {
      return { success: false, error: `margin: no margin params for ${problems.join(", ")}` };
    }
    return { success: true, data: { params: out, fallbacks } };
  }
}

/** 控えを使うときの形。新規建ては止める（読めないペアに新しい建玉を足させない） */
function lastKnownParams(kept: MarginPairParams): MarginPairParams {
  return { ...kept, riskRatioSource: "last-known", stopNewLong: true, stopNewShort: true };
}

/** 控えを使ったペアの申告（tick の warnings・コマンドの出力） */
export function fallbackWarning(fallbacks: readonly string[]): string[] {
  if (fallbacks.length === 0) return [];
  return [
    `margin: using last-known margin params for ${fallbacks.join(", ")} (no longer readable from pairs; new opens are stopped)`,
  ];
}
