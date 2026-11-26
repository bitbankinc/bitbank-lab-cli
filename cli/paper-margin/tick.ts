// paper の lazy tick の、信用の state 更新（ADR-010 / docs/dev/paper-margin-plan.md §3.5・§3.6）。純関数。
// runTick の updateState（lock 内）から呼ぶ。足・pairs の取得は lock の外（cli/paper-margin-tick.ts）。
// - 現物の約定を反映した後の state に scan.ts を回し、建玉・注文・追証・JPY を書き戻す
// - 走査の始点は fresh な state の走査済み時刻（margin.lastScanAt）。足の始点も fresh な値で揃え直し、
//   lock の外で取った後に別の tick が進めた区間を 2 度走査しない
// - 指値の約定と強制決済の決済は margin.history に積む（tick-report.ts）。読めたパラメータは控えに残す（last-params.ts）
// - 窓の中で約定した現物（約定履歴から。spot-sale.ts）の JPY は約定時刻から評価に入れ、JPY 建ての指値の売りは
//   その時刻に追証の解消の行為として判定する（差入方法の「現物の売却」）
import type { Candle } from "../commands/public/candles-fetch.js";
import type { PaperState } from "../paper-state.js";
import type { Result } from "../types.js";
import { bookOf, marginScannedAtMs, withBook } from "./book.js";
import { withLastParams } from "./last-params.js";
import type { MarginPairParams } from "./params.js";
import { scanMargin } from "./scan.js";
import { spotEventsSince } from "./spot-sale.js";
import { type MarginTickReport, reportOfScan } from "./tick-report.js";

export type MarginTickInput = {
  candlesByPair: Map<string, Candle[]>;
  params: Map<string, MarginPairParams>;
  /** 足を拾い始める時刻（lock の外で読んだ走査済み時刻を、足の区切りに揃えたもの） */
  candleFromMs: number;
  /** 足の区切り（1min 足なら 60,000、4hour 足なら 14,400,000） */
  periodMs: number;
  /** 24h を超える区間を 4hour 足で見たか */
  approximate: boolean;
};

export type { MarginTickEvent, MarginTickReport } from "./tick-report.js";

export function applyMarginTick(
  state: PaperState,
  input: MarginTickInput,
  nowMs: number,
  /** pendingSpotSales: まだ解消の判定に使っていない現物の売りの約定時刻（spot-sale.ts の spotEventsSince） */
  opts: { newId: () => string; pendingSpotSales?: readonly string[] },
): Result<{ state: PaperState; report: MarginTickReport }> {
  const fromMs = Math.min(marginScannedAtMs(state), nowMs);
  const scan = scanMargin({
    book: bookOf(state),
    candlesByPair: input.candlesByPair,
    params: input.params,
    rules: state.margin.assumptions.rules,
    fromMs,
    toMs: nowMs,
    periodMs: input.periodMs,
    ...spotEventsSince(state.history, fromMs, pendingAfterCall(state, opts.pendingSpotSales)),
    candleFromMs: Math.max(
      input.candleFromMs,
      Math.floor(fromMs / input.periodMs) * input.periodMs,
    ),
  });
  if (!scan.success) return scan;
  const { filled, events } = reportOfScan(scan.data.events, opts.newId);
  const next = withLastParams(withBook(state, scan.data.book), input.params);
  const margin = { ...next.margin, history: [...next.margin.history, ...filled] };
  return {
    success: true,
    data: {
      state: { ...next, margin },
      report: { filled, events, approximate: input.approximate },
    },
  };
}

/** 持ち越した売りのうち、走査の開始時点の追証の基準時以降に約定したもの。基準時より前の売りは、その代金も含めて
 *  追証が判定されているので、解消の行為には数えない（窓の頭に寄せて数えると、値戻しだけで解消してしまう） */
function pendingAfterCall(state: PaperState, pending: readonly string[] = []): string[] {
  const call = state.margin.call;
  if (!call) return [...pending];
  const judgedAt = Date.parse(call.judgedAt);
  return pending.filter((at) => Date.parse(at) >= judgedAt);
}
