// `bitbank periodical-brief` — 複数銘柄の商い状況ダイジェスト（public のみ・読み取り専用）。
//
// 生ローソク足を LLM に渡すと 1 回の日次分析で数万トークンを消費し、指標の手計算も遅く
// 検算コストがかかる。計算を CLI 側に寄せて 1 銘柄 3 行に圧縮する（issue #21）。
// ADR-002 の例外で、根拠は ADR-008。計算本体は cli/brief/。
import { z } from "zod";
import { DEFAULT_CONCURRENCY, MAX_CONCURRENCY } from "../../brief/concurrency.js";
import { rankedPairs } from "../../brief/rank.js";
import { runBrief } from "../../brief/run.js";
import type { Brief } from "../../brief/schema.js";
import { EXIT } from "../../exit-codes.js";
import type { HttpOptions } from "../../http.js";
import type { Result } from "../../types.js";
import { formatZodError, PairSchema } from "../../validators.js";

export const DEFAULT_PAIRS = ["btc_jpy", "eth_jpy", "xrp_jpy"];

const PositiveInt = (label: string) =>
  z
    .string()
    .regex(/^[1-9]\d*$/, `${label} must be a positive integer`)
    .transform(Number);

/** 入力契約は Zod が単一ソース（CLAUDE.md）。pairs は位置引数または `--pairs=a,b`。 */
const RequestSchema = z
  .object({
    pairs: z.array(PairSchema).optional(),
    top: PositiveInt("--top").optional(),
    all: z.boolean().optional(),
    concurrency: PositiveInt("--concurrency")
      .refine((n) => n <= MAX_CONCURRENCY, `--concurrency must be <= ${MAX_CONCURRENCY}`)
      .optional(),
    noCache: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    const modes = [val.top !== undefined, val.all === true, (val.pairs?.length ?? 0) > 0];
    if (modes.filter(Boolean).length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "--top, --all and explicit pairs are mutually exclusive",
        path: ["pairs"],
      });
    }
  });

export type PeriodicalBriefArgs = z.input<typeof RequestSchema>;
export type PeriodicalBriefData = Brief;

async function selectPairs(
  a: z.output<typeof RequestSchema>,
  opts?: HttpOptions,
): Promise<Result<string[]>> {
  if (a.top === undefined && a.all !== true) {
    return { success: true, data: a.pairs?.length ? a.pairs : DEFAULT_PAIRS };
  }
  const ranked = await rankedPairs(opts);
  if (!ranked.success) return ranked;
  if (ranked.data.length === 0) {
    return { success: false, error: "No tradable JPY pairs found in tickers" };
  }
  return { success: true, data: a.top === undefined ? ranked.data : ranked.data.slice(0, a.top) };
}

export async function periodicalBrief(
  args: PeriodicalBriefArgs,
  opts?: HttpOptions,
): Promise<Result<PeriodicalBriefData>> {
  const parsed = RequestSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: formatZodError(parsed.error), exitCode: EXIT.PARAM };
  }
  const selected = await selectPairs(parsed.data, opts);
  if (!selected.success) return selected;
  return runBrief(
    {
      pairs: [...new Set(selected.data)],
      nowMs: Date.now(),
      concurrency: parsed.data.concurrency ?? DEFAULT_CONCURRENCY,
      noCache: parsed.data.noCache === true,
    },
    opts,
  );
}
