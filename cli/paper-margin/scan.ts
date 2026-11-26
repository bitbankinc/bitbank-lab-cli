// paper の信用の時系列の処理（ADR-010 決定 4・7 / docs/dev/paper-margin-plan.md §3.5・§3.6）。純関数。
// 前回 tick（fromMs）から今回（toMs）までの時刻を古い順にたどり、各時刻を scan-step.ts で処理する。
// 時刻は「足の時刻」「JST 15 時（追証の基準時）」「追証の期限」「現物の売りの約定」「toMs」の和。
// 走査中に追証が出たら、その期限も足す。
// 価格は scan-prices.ts（足が無い時刻は直前の終値）。足の粒度は問わない
// （24h を超える区間は 4hour 足を渡す。近似であることの申告は呼び出し側）。
// toMs の時刻でも利息を積んでから強制決済を判定する（最後の足より後に JST 0 時があっても漏らさない）。
import { jstDailyInstants } from "../date-utils.js";
import type { Result } from "../types.js";
import { accrueInterest, type InterestCharge } from "./interest.js";
import type { ScanContext, ScanEvent, ScanInput } from "./scan-context.js";
import { buildPriceTrack } from "./scan-prices.js";
import { step } from "./scan-step.js";
import type { MarginBook } from "./state.js";

export type { ScanEvent, ScanInput } from "./scan-context.js";

export type ScanResult = { book: MarginBook; events: ScanEvent[]; interest: InterestCharge[] };

/** 昇順の queue の from 番目以降に t を差し込む（既にあれば何もしない） */
function insertTime(queue: number[], t: number, from: number): void {
  if (queue.includes(t)) return;
  let j = from;
  while (j < queue.length && queue[j] < t) j++;
  queue.splice(j, 0, t);
}

export function scanMargin(input: ScanInput): Result<ScanResult> {
  const { book: start, fromMs, toMs, rules } = input;
  const pairs = new Set([...start.positions, ...start.orders].map((x) => x.pair));
  if (pairs.size === 0) return { success: true, data: { book: start, events: [], interest: [] } };
  const candleFromMs = Math.min(input.candleFromMs ?? fromMs, fromMs);
  const periodMs = input.periodMs ?? 60_000;
  const track = buildPriceTrack(input.candlesByPair, pairs, candleFromMs, toMs, periodMs);
  if (!track.success) return track;
  const ctx: ScanContext = { input, track: track.data, events: [], interest: [] };
  const callTimes = new Set(jstDailyInstants(fromMs, toMs, rules.marginCallHourJst));
  const sales = (input.spotSaleTimes ?? []).filter((t) => t >= fromMs && t <= toMs);
  // toMs も 1 時刻として処理する（最後の足より後に積んだ利息で強制決済の判定基準を割っていないかを、この tick で見る）
  const times = [...track.data.candleTimes, ...callTimes, ...sales, toMs];
  const queue = [...new Set(times)].sort((a, b) => a - b);
  if (start.call) insertTime(queue, Date.parse(start.call.deadline), 0);
  let book = start;
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i];
    if (t < candleFromMs || t > toMs) continue;
    const r = step(ctx, book, t, callTimes.has(t));
    if (!r.success) return r;
    const raised = r.data.call !== null && r.data.call !== book.call;
    book = r.data;
    if (raised && book.call) insertTime(queue, Date.parse(book.call.deadline), i + 1);
  }
  const tail = accrueInterest(book.positions, input.params, toMs);
  if (!tail.success) return tail;
  ctx.interest.push(...tail.data.charges);
  const end = { ...book, positions: tail.data.positions };
  return { success: true, data: { book: end, events: ctx.events, interest: ctx.interest } };
}
