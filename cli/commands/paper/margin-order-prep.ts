// paper create-margin-order の、lock の外の取得と検証（ADR-010 / docs/dev/paper-margin-plan.md §4 Step 5）。
// public の API だけを叩く: pairs（数量の検証・信用対応・新規建て停止）。現在値（ticker）は last-prices.ts。
// - 数量・価格の桁は現物と同じ検証（order-validate.ts の validateOrderSize）
// - 信用非対応のペアは PARAM（本番では 40167）。比率が期限切れなら pairs を 1 度だけ取り直す
// - 信用パラメータを読めなくなったペアでも、state に控えがあれば返済だけは通す（新規建ては止める）
// - 新規建て停止（stop_margin_long_order / stop_margin_short_order）は新規建てだけを止める。返済は止めない
//   （本番の停止エラーは方向別: 買い新規 50083 / 売り新規 50081）
import { EXIT } from "../../exit-codes.js";
import type { MarginIntent, PositionSide } from "../../margin-operation.js";
import type { CachedPair } from "../../pairs-cache.js";
import { type MarginPairParams, marginParamsOf } from "../../paper-margin/params.js";
import type { Result } from "../../types.js";
import { validateOrderSize } from "./order-validate.js";

type GetPairs = () => Promise<Result<CachedPair[]>>;

export async function checkOrderPair(
  req: {
    pair: string;
    type: "market" | "limit";
    amount: number;
    price?: number;
    positionSide: PositionSide;
    intent: MarginIntent;
  },
  o: {
    nowMs: number;
    getPairs: GetPairs;
    refreshPairs: GetPairs;
    /** state に残る、このペアの最後に読めた信用パラメータ（paper-margin-pairs.ts） */
    lastKnown?: MarginPairParams;
  },
): Promise<Result<{ ok: true }>> {
  let pairs = await o.getPairs();
  if (!pairs.success) return pairs;
  if (!listed(pairs.data, req.pair)) return unlisted(req.pair);
  const size = validateOrderSize(req.pair, req.type, req.amount, pairs.data, req.price);
  if (!size.success) return { ...size, exitCode: EXIT.PARAM };
  const lookupIn = (list: CachedPair[]) => {
    const info = list.find((p) => p.name === req.pair);
    return info
      ? marginParamsOf(info, o.nowMs)
      : ({ kind: "unknown", reason: "not in pairs" } as const);
  };
  let lookup = lookupIn(pairs.data);
  if (lookup.kind === "stale") {
    pairs = await o.refreshPairs();
    if (!pairs.success) return pairs;
    // 取り直した pairs から消えていれば、控えがあっても返済に進ませない（最初の pairs が古いキャッシュだった場合）
    if (!listed(pairs.data, req.pair)) return unlisted(req.pair);
    lookup = lookupIn(pairs.data);
  }
  // 取扱終了・フィールド欠落などで読めなくなったペアでも、控えがあれば返済は通す（建玉を閉じられなくしない）。
  // 口座評価には控えのパラメータを使う（paper-margin-pairs.ts）。新規建ては下の検査で止める
  if (lookup.kind !== "ok" && req.intent === "close" && o.lastKnown) {
    return { success: true, data: { ok: true } };
  }
  if (lookup.kind === "unsupported") {
    return {
      success: false,
      error: `信用取引に対応していないペアです: ${req.pair}（本番では 40167 で拒否される。信用対応ペアは pairs の margin_current_individual_ratio があるもの）`,
      exitCode: EXIT.PARAM,
    };
  }
  if (lookup.kind !== "ok") {
    const why =
      lookup.kind === "unknown" ? lookup.reason : "risk ratio is past its until even after refresh";
    return {
      success: false,
      error: `margin order: cannot read margin params for ${req.pair} (${why})`,
    };
  }
  const stopped =
    req.positionSide === "long" ? lookup.params.stopNewLong : lookup.params.stopNewShort;
  if (req.intent === "open" && stopped) {
    const [label, code] =
      req.positionSide === "long" ? ["ロング（買い）", 50083] : ["ショート（売り）", 50081];
    return {
      success: false,
      error: `${req.pair} の${label}新規建ては停止中です（本番では ${code} で拒否される）。返済はできます`,
    };
  }
  return { success: true, data: { ok: true } };
}

const listed = (list: readonly CachedPair[], pair: string) => list.some((p) => p.name === pair);

/** pairs から消えたペア（取扱終了など）は、控えのパラメータがあっても返済できない（lazy tick の足も ticker も
 *  取れないので、口座の評価も約定の価格も決められない）。理由が分かるエラーにする */
function unlisted(pair: string): Result<never> {
  return {
    success: false,
    error:
      `pairs に無いペアです: ${pair}（取扱終了など）。paper では足と現在値を取れないので、` +
      "このペアの注文（返済を含む）は出せません。建玉を消すには paper reset で作り直してください",
    exitCode: EXIT.PARAM,
  };
}
