// `bitbank balance-history` — JPY 建て資産推移の再構築（private GET のみ・読み取り専用）。
//
// 「現在の保有量 × 過去の価格」ではなく、**現在の残高から約定・入出金を逆算して**各時点の
// 保有を復元する。積み立て口座では前者が実残高から大きく乖離し、実機確認 #14 の追試で
// 口座の持ち主が「資産が半減した」と誤認しかけた。計算本体は cli/portfolio/。
import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import type { PrivateHttpOptions } from "../../http-private.js";
import { GRANULARITIES } from "../../portfolio/grid.js";
import { runBalanceHistory } from "../../portfolio/run.js";
import type { BalanceHistory } from "../../portfolio/schema.js";
import type { Result } from "../../types.js";
import { formatZodError } from "../../validators.js";
import { parseMaxPages, TimestampMsSchema } from "./input-schemas.js";

/** 履歴取得は「ペア数 + 資産数」ぶんの private GET を逐次で回すため、既定は短めの窓にする。 */
const DEFAULT_DAYS = 30;
const MAX_PAGES_DEFAULT = 1000;
const DAY_MS = 86_400_000;

const DaysSchema = z.string().regex(/^[1-9]\d*$/, "days must be a positive integer");

/** 入力契約は Zod が単一ソース（CLAUDE.md）。`--max-pages` だけは他の private コマンドと
 *  共有の `parseMaxPages` が数値化まで持つので、ここでは形だけ受けて後段へ渡す。 */
const RequestSchema = z
  .object({
    since: TimestampMsSchema.optional(),
    days: DaysSchema.optional(),
    granularity: z.enum(GRANULARITIES).optional(),
    maxPages: z.string().optional(),
    noCache: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.since !== undefined && val.days !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "--since cannot be combined with --days",
        path: ["since"],
      });
    }
  });

export type BalanceHistoryArgs = z.infer<typeof RequestSchema>;
export type BalanceHistoryData = BalanceHistory;

export async function balanceHistory(
  args: BalanceHistoryArgs,
  opts?: PrivateHttpOptions,
): Promise<Result<BalanceHistoryData>> {
  const parsed = RequestSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: formatZodError(parsed.error), exitCode: EXIT.PARAM };
  }
  const mp = parseMaxPages(parsed.data.maxPages, MAX_PAGES_DEFAULT);
  if (!mp.success) return mp;

  // --since（Unix ms）を優先し、無ければ --days 遡る（併用は上の superRefine が弾く）
  const nowMs = Date.now();
  const days = parsed.data.days === undefined ? DEFAULT_DAYS : Number(parsed.data.days);
  const sinceMs =
    parsed.data.since === undefined ? nowMs - days * DAY_MS : Number(parsed.data.since);

  return runBalanceHistory(
    {
      sinceMs,
      nowMs,
      granularity: parsed.data.granularity ?? "day",
      maxPages: mp.data,
      noCache: parsed.data.noCache === true,
    },
    opts,
  );
}
