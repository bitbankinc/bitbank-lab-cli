// paper margin-positions（ADR-010 / docs/dev/paper-margin-plan.md §3.7）。本番 bitbank margin-positions の paper 版。
// 欄の組み立ては paper-margin/positions-view.ts、取得は margin-view-prep.ts。--pair は本番と同じく取得後の絞り込み。
import { EXIT } from "../../exit-codes.js";
import type { HttpOptions } from "../../http.js";
import {
  buildMarginPositions,
  type MarginPositionsView,
} from "../../paper-margin/positions-view.js";
import { withStatePath } from "../../paper-result.js";
import type { Result } from "../../types.js";
import { validatePair } from "../../validators.js";
import { type MarginViewArgs, prepareMarginView } from "./margin-view-prep.js";

export async function paperMarginPositions(
  args: MarginViewArgs & { pair?: string } = {},
  opts?: HttpOptions,
): Promise<Result<MarginPositionsView>> {
  let pair: string | undefined;
  if (args.pair !== undefined) {
    const pv = validatePair(args.pair);
    if (!pv.success) return { ...pv, exitCode: EXIT.PARAM };
    pair = pv.data;
  }
  const v = await prepareMarginView(args, opts);
  if (!v.success) return v;
  const { state, prices, nowMs, path } = v.data;
  return withStatePath(
    { success: true, data: buildMarginPositions(state, prices, nowMs, pair) },
    path,
  );
}
