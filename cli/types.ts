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
};

export type Result<T> =
  | { success: true; data: T; partial?: boolean; meta?: ResultMeta }
  | { success: false; error: string; exitCode?: ExitCode };

export type Format = "json" | "table" | "csv";
