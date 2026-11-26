// 信用パラメータの控え（state の margin.lastParams。ADR-010 / docs/dev/paper-margin-plan.md §3.4）。純関数。
// pairs から読めたペアのパラメータを残しておき、後で読めなくなったとき（信用の取扱終了・フィールド欠落など）に
// paper-margin-pairs.ts が建玉の評価・返済に使う。控え自体（last-known）は上書きに使わない。
import type { PaperState } from "../paper-state.js";
import type { MarginPairParams } from "./params.js";

export function withLastParams(
  state: PaperState,
  params: ReadonlyMap<string, MarginPairParams>,
): PaperState {
  const fresh = [...params].filter(([, p]) => p.riskRatioSource !== "last-known");
  if (fresh.length === 0) return state;
  const lastParams = { ...state.margin.lastParams, ...Object.fromEntries(fresh) };
  return { ...state, margin: { ...state.margin, lastParams } };
}
