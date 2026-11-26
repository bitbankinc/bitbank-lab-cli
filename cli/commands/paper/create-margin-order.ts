// paper の信用の新規建て・返済（ADR-010 決定 2 / docs/dev/paper-margin-plan.md §3.2・§4 Step 5）。
// 語彙は本番の trade create-margin-order（ADR-009）と同じ: --position-side 必須、--intent は任意のクロスチェック、
// 結果に side × position_side の操作ラベル。paper は実資金に触れないので --execute / --confirm は無い。
// 流れ: 入力（margin-order-input.ts）→ 操作ラベル → pairs で数量・信用対応・新規建て停止を検証
// （margin-order-prep.ts）→ lazy tick → 口座評価に要る信用パラメータと現在値を取る →
// lock 内で受け付けて指値を積む / 成行を約定させる（paper-margin/order.ts）。
import type { HttpOptions } from "../../http.js";
import { checkMarginIntent } from "../../margin-operation.js";
import { getPairsWithCache } from "../../pairs-cache.js";
import { runTick } from "../../paper-fill.js";
import {
  applyMarginOrder,
  type MarginOrderPlan,
  type PaperMarginFill,
  type PaperMarginPlaced,
} from "../../paper-margin/order.js";
import { fallbackWarning, resolveMarginParams } from "../../paper-margin-pairs.js";
import { withStatePath } from "../../paper-result.js";
import { defaultStatePath, genId, loadState } from "../../paper-state.js";
import { updateState } from "../../paper-state-mutate.js";
import type { Result } from "../../types.js";
import { fetchLastPrices } from "./last-prices.js";
import { type PaperCreateMarginOrderArgs, parseMarginOrderInput } from "./margin-order-input.js";
import { checkOrderPair } from "./margin-order-prep.js";

export type { PaperCreateMarginOrderArgs } from "./margin-order-input.js";

type Placed = PaperMarginFill | PaperMarginPlaced;

export async function paperCreateMarginOrder(
  args: PaperCreateMarginOrderArgs,
  opts?: HttpOptions,
): Promise<Result<Placed>> {
  const input = parseMarginOrderInput(args);
  if (!input.success) return input;
  const { pair, side, positionSide, type, amount, price, intent } = input.data;
  const op = checkMarginIntent(side, positionSide, intent);
  if (!op.success) return op;
  const nowMs = args.nowMs ?? Date.now();
  const getPairs = args.getPairs ?? (() => getPairsWithCache({ httpOptions: opts }));
  const refreshPairs =
    args.getPairs ?? (() => getPairsWithCache({ refresh: true, httpOptions: opts }));
  const path = args.statePath ?? defaultStatePath();
  // pairs から信用パラメータを読めなくなったペアでも、控え（margin.lastParams）があれば返済だけは通す
  const before = await loadState(path);
  if (!before.success) return before;
  const lastKnown = before.data?.margin.lastParams;
  const order = { pair, type, amount, price, positionSide, intent: op.data.intent };
  const pre = await checkOrderPair(order, {
    nowMs,
    getPairs,
    refreshPairs,
    lastKnown: lastKnown?.[pair],
  });
  if (!pre.success) return pre;
  const tick = await runTick({
    statePath: path,
    fetchCandles: args.fetchCandles,
    fetchCoarseCandles: args.fetchCoarseCandles,
    getPairs: args.getPairs,
    nowMs,
  });
  if (!tick.success) return tick;
  // 口座評価には、建玉と未約定の信用注文のある全ペアの比率（約定時必要保証金にも要る）と、
  // 建玉のある全ペアの現在値が要る（lock の外で取る）
  const peek = await loadState(path);
  if (!peek.success) return peek;
  const held = (peek.data?.margin.positions ?? []).map((p) => p.pair);
  const ordered = (peek.data?.margin.orders ?? []).map((o) => o.pair);
  const booked = [...new Set([...held, ...ordered, pair])];
  const params = await resolveMarginParams(booked, {
    ...{ nowMs, getPairs, refreshPairs },
    lastKnown: peek.data?.margin.lastParams,
  });
  if (!params.success) return params;
  for (const w of fallbackWarning(params.data.fallbacks)) process.stderr.write(`Warning: ${w}\n`);
  const prices = await fetchLastPrices([...new Set([...held, pair])], opts);
  if (!prices.success) return prices;
  const plan: MarginOrderPlan = {
    ...{ pair, side, positionSide, type, amount, price, op: op.data },
    ...{ params: params.data.params, prices: prices.data, nowMs, newId: genId },
  };
  const r = await updateState<Placed>(
    (state) => {
      const a = applyMarginOrder(state, plan);
      return a.success
        ? { success: true, data: { state: a.data.state, result: a.data.result } }
        : a;
    },
    { path },
  );
  return withStatePath(r, path);
}
