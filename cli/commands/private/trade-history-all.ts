// 100行超: trade-history-all（全件取得）と --all ディスパッチャを同居させ、
// trade-history(leaf) → all の循環依存を断つため
// trade-history.ts を自動ページングで全件取得するラッパー
// CLI では `trade-history --all` で呼び出される
import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import type { PrivateHttpOptions } from "../../http-private.js";
import type { Result } from "../../types.js";
import { validatePair } from "../../validators.js";
import { formatZodError } from "./input-schemas.js";
import { type Trade, type TradeHistoryArgs, tradeHistory } from "./trade-history.js";

// bitbank API の1リクエストあたり最大取得件数
const PAGE_SIZE = 1000;
// 既定の最大ページ数。誤起動・API 仕様変更で無限化しないための安全弁
export const MAX_PAGES_DEFAULT = 1000;

const MaxPagesSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "max-pages must be a positive integer")
  .transform((s, ctx) => {
    const n = Number(s);
    if (!Number.isSafeInteger(n)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "max-pages must be a safe integer (≤ 2^53 - 1)",
      });
      return z.NEVER;
    }
    return n;
  });

type TradeHistoryAllArgs = {
  pair: string | undefined;
  since?: string;
  end?: string;
  maxPages?: string;
};

export async function tradeHistoryAll(
  args: TradeHistoryAllArgs,
  opts?: PrivateHttpOptions,
): Promise<Result<Trade[]>> {
  const pv = validatePair(args.pair);
  if (!pv.success) return pv;

  let maxPages = MAX_PAGES_DEFAULT;
  if (args.maxPages !== undefined) {
    const parsed = MaxPagesSchema.safeParse(args.maxPages);
    if (!parsed.success) {
      return { success: false, error: formatZodError(parsed.error), exitCode: EXIT.PARAM };
    }
    maxPages = parsed.data;
  }

  const allTrades: Trade[] = [];
  const seen = new Set<number>();
  let since = args.since;

  for (let page = 0; page < maxPages; page++) {
    const result = await tradeHistory(
      {
        pair: pv.data,
        count: String(PAGE_SIZE),
        order: "asc",
        since,
        end: args.end,
      },
      opts,
    );
    if (!result.success) return result;

    const trades = result.data;
    let added = 0;
    for (const t of trades) {
      if (!seen.has(t.trade_id)) {
        seen.add(t.trade_id);
        allTrades.push(t);
        added++;
      }
    }

    if (trades.length < PAGE_SIZE) return { success: true, data: allTrades };
    if (added === 0) return { success: true, data: allTrades };

    const last = trades[trades.length - 1];
    since = String(last.executed_at);
  }

  return {
    success: true,
    data: allTrades,
    partial: true,
    meta: { truncated: true, reason: "MAX_PAGES", returnedRows: allTrades.length },
  };
}

/** --all 分岐を吸収するディスパッチ関数 */
export async function tradeHistoryDispatch(
  args: TradeHistoryArgs & { all: boolean; maxPages?: string },
  opts?: PrivateHttpOptions,
): Promise<Result<Trade[]>> {
  if (args.all) {
    return tradeHistoryAll(
      { pair: args.pair, since: args.since, end: args.end, maxPages: args.maxPages },
      opts,
    );
  }
  return tradeHistory(args, opts);
}
