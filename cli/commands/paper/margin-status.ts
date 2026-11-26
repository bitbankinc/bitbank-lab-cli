// paper margin-status（ADR-010 / docs/dev/paper-margin-plan.md §3.7）。本番 bitbank margin-status の paper 版。
// 欄の組み立ては paper-margin/status.ts、取得は margin-view-prep.ts。
import type { HttpOptions } from "../../http.js";
import { buildMarginStatus, type MarginStatusView } from "../../paper-margin/status.js";
import { withStatePath } from "../../paper-result.js";
import type { Result } from "../../types.js";
import { type MarginViewArgs, prepareMarginView } from "./margin-view-prep.js";

export async function paperMarginStatus(
  args: MarginViewArgs = {},
  opts?: HttpOptions,
): Promise<Result<MarginStatusView>> {
  const v = await prepareMarginView(args, opts);
  if (!v.success) return v;
  const { state, params, prices, nowMs, path } = v.data;
  return withStatePath(buildMarginStatus(state, params, prices, nowMs), path);
}
