import { z } from "zod";
import type { ExitCode } from "./exit-codes.js";

const RateLimitSchema = z.object({
  remaining: z.number(),
  limit: z.number(),
  reset: z.number(),
});

export type RateLimitInfo = z.infer<typeof RateLimitSchema>;

export type TruncationReason = "MAX_RANGE_FETCHES" | "HARD_MAX_SEGMENTS" | "MAX_PAGES";

export type Gap = { from: number; to: number; missing: number };

/** 取得元の粗い分類（modulePath ベース）。将来ホスト粒度へ精緻化する余地あり。 */
export type Source = "public" | "private";

/** 取得コンテキスト: どのコマンドを・どのパラメータで叩いたか（再現性のため meta に付与）。 */
export type RequestContext = {
  command: string;
  pair?: string;
  type?: string;
  date?: string;
  from?: string;
  to?: string;
  limit?: number;
};

export type ResultMeta = {
  rateLimit?: RateLimitInfo;
  truncated?: boolean;
  truncatedAt?: string;
  requestedLimit?: number;
  returnedRows?: number;
  reason?: TruncationReason;
  dedupedCount?: number;
  gaps?: Gap[];
  lastIsIncomplete?: boolean;
  request?: RequestContext;
  timezone?: "UTC"; // 取得時の日付基準。常に "UTC"
  source?: Source; // 取得元（public / private）
  fetchedAt?: string; // 取得時刻（ISO 8601 / UTC）
};

export type Result<T> =
  | { success: true; data: T; partial?: boolean; meta?: ResultMeta }
  | { success: false; error: string; exitCode?: ExitCode };

export type Format = "json" | "table" | "csv";

/** Trade dry-run のプレビュー構造化データ。--machine では envelope の data に載り、
 *  human 表示では output-dry-run.ts が整形ボックスへ描画する。 */
export type DryRunData = {
  dryRun: true;
  endpoint: string;
  body: Record<string, unknown>;
  executeHint: string;
  confirmPhrase?: string;
};
