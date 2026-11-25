// private read 系コマンドの入力検証用スキーマ。
// 数値・タイムスタンプ・order は文字列のまま保持し、compactParams にそのまま渡す。
import { z } from "zod";
import { jstYearRangeMs } from "../../date-utils.js";
import { EXIT } from "../../exit-codes.js";
import type { Result } from "../../types.js";
import { formatZodError } from "../../validators.js";

// formatZodError はカテゴリ非依存のため cli/validators.ts へ移設。後方互換で re-export。
export { formatZodError } from "../../validators.js";

// trade-history-all.ts の PAGE_SIZE に揃えた API 上限の目安
const MAX_COUNT = 1000;

export const CountSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "count must be a positive integer")
  .refine((v) => Number(v) <= MAX_COUNT, `count must be ≤ ${MAX_COUNT}`);

export const TimestampMsSchema = z
  .string()
  .regex(/^\d+$/, "timestamp must be a non-negative integer (ms)");

export const OrderEnumSchema = z.enum(["asc", "desc"]);

export function refineSinceEnd(val: { since?: string; end?: string }, ctx: z.RefinementCtx): void {
  if (val.since !== undefined && val.end !== undefined) {
    if (Number(val.since) > Number(val.end)) {
      ctx.addIssue({
        code: "custom",
        message: "since must be ≤ end",
        path: ["since"],
      });
    }
  }
}

// --- *-history-all 系（--all/--year 自動ページング）共通の入力検証 ---

const MaxPagesSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "max-pages must be a positive integer")
  .transform((s, ctx) => {
    const n = Number(s);
    if (!Number.isSafeInteger(n)) {
      ctx.addIssue({
        code: "custom",
        message: "max-pages must be a safe integer (≤ 2^53 - 1)",
      });
      return z.NEVER;
    }
    return n;
  });

/** --max-pages を検証して数値化する。未指定は dflt を返す。 */
export function parseMaxPages(v: string | undefined, dflt: number): Result<number> {
  if (v === undefined) return { success: true, data: dflt };
  const parsed = MaxPagesSchema.safeParse(v);
  if (!parsed.success)
    return { success: false, error: formatZodError(parsed.error), exitCode: EXIT.PARAM };
  return { success: true, data: parsed.data };
}

// 先頭 0 の年（0000〜0999）は拒否する。特に 0〜99 年は Date.UTC が 1900 年代へ
// 補正するため、jstYearRangeMs の範囲と filterYear が食い違い全件落ちする
const YearSchema = z.string().regex(/^[1-9]\d{3}$/, "year must be a 4-digit year (1000-9999, JST)");

export type YearWindow = { since?: string; end?: string; filterYear?: number };

/**
 * --year（JST 年分、ADR-004 の税務例外）を範囲クエリへ解決する。--since/--end との
 * 併用は PARAM エラー。bitbank の end 境界の含む/排他が未確定なため、呼び出し側は
 * filterYear（jstYear 一致）で年分を確定させること。
 */
export function resolveYearWindow(args: {
  since?: string;
  end?: string;
  year?: string;
}): Result<YearWindow> {
  if (args.year === undefined) return { success: true, data: { since: args.since, end: args.end } };
  if (args.since !== undefined || args.end !== undefined) {
    return {
      success: false,
      error: "--year cannot be combined with --since/--end",
      exitCode: EXIT.PARAM,
    };
  }
  const parsed = YearSchema.safeParse(args.year);
  if (!parsed.success)
    return { success: false, error: formatZodError(parsed.error), exitCode: EXIT.PARAM };
  const filterYear = Number(parsed.data);
  const range = jstYearRangeMs(filterYear);
  return {
    success: true,
    data: { since: String(range.startMs), end: String(range.endMs), filterYear },
  };
}
