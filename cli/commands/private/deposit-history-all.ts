// 100行超: 全件ページング（後方 end 走査）と --all/--year ディスパッチャを同居させ、
// deposit-history(leaf) → all の循環依存を断つため。--year は JST 年分（ADR-004 の税務例外）
import { z } from "zod";
import { jstYear, jstYearRangeMs } from "../../date-utils.js";
import { EXIT } from "../../exit-codes.js";
import type { PrivateHttpOptions } from "../../http-private.js";
import type { Result } from "../../types.js";
import { type Deposit, type DepositHistoryArgs, depositHistory } from "./deposit-history.js";
import { formatZodError } from "./input-schemas.js";

const PAGE_SIZE = 1000;
export const MAX_PAGES_DEFAULT = 1000;

const MaxPagesSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "max-pages must be a positive integer")
  .transform((s, ctx) => {
    const n = Number(s);
    if (!Number.isSafeInteger(n)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "max-pages must be a safe integer (≤ 2^53 - 1)" });
      return z.NEVER;
    }
    return n;
  });

const YearSchema = z.string().regex(/^\d{4}$/, "year must be 4 digits (YYYY, JST)");

type DepositHistoryAllArgs = {
  asset?: string;
  since?: string;
  end?: string;
  year?: string;
  maxPages?: string;
};

export async function depositHistoryAll(
  args: DepositHistoryAllArgs,
  opts?: PrivateHttpOptions,
): Promise<Result<Deposit[]>> {
  let maxPages = MAX_PAGES_DEFAULT;
  if (args.maxPages !== undefined) {
    const parsed = MaxPagesSchema.safeParse(args.maxPages);
    if (!parsed.success) return { success: false, error: formatZodError(parsed.error), exitCode: EXIT.PARAM };
    maxPages = parsed.data;
  }

  // --year（JST 年分）: 範囲クエリ + 取得後の厳密フィルタ。bitbank の end 境界の
  // 含む/排他が未確定なため、jstYear で年分を確定させる（ADR-004 の税務例外）。
  let since = args.since;
  let end = args.end;
  let filterYear: number | undefined;
  if (args.year !== undefined) {
    if (args.since !== undefined || args.end !== undefined) {
      return { success: false, error: "--year cannot be combined with --since/--end", exitCode: EXIT.PARAM };
    }
    const parsed = YearSchema.safeParse(args.year);
    if (!parsed.success) return { success: false, error: formatZodError(parsed.error), exitCode: EXIT.PARAM };
    filterYear = Number(parsed.data);
    const range = jstYearRangeMs(filterYear);
    since = String(range.startMs);
    end = String(range.endMs);
  }

  const all: Deposit[] = [];
  const seen = new Set<string>();
  let truncated = true;
  for (let page = 0; page < maxPages; page++) {
    const result = await depositHistory({ asset: args.asset, count: String(PAGE_SIZE), since, end }, opts);
    if (!result.success) return result;
    let added = 0;
    for (const r of result.data) {
      if (!seen.has(r.uuid)) {
        seen.add(r.uuid);
        all.push(r);
        added++;
      }
    }
    if (result.data.length < PAGE_SIZE || added === 0) {
      truncated = false;
      break;
    }
    // 後方 end 走査: このページ最古の found_at より前へ。dedup が境界重複を吸収する。
    end = String(Math.min(...result.data.map((r) => r.found_at)));
  }

  all.sort((a, b) => a.found_at - b.found_at); // 時系列（税務台帳向け）
  const data = filterYear === undefined ? all : all.filter((r) => jstYear(r.found_at) === filterYear);

  if (truncated) {
    return {
      success: true,
      data,
      partial: true,
      meta: { truncated: true, reason: "MAX_PAGES", returnedRows: data.length },
    };
  }
  return { success: true, data };
}

/** --all / --year を全件取得へ、それ以外を単一ページ取得へ振り分ける。 */
export async function depositHistoryDispatch(
  args: DepositHistoryArgs & { all?: boolean; year?: string; maxPages?: string },
  opts?: PrivateHttpOptions,
): Promise<Result<Deposit[]>> {
  if (args.all || args.year !== undefined) {
    return depositHistoryAll(
      { asset: args.asset, since: args.since, end: args.end, year: args.year, maxPages: args.maxPages },
      opts,
    );
  }
  return depositHistory(args, opts);
}
