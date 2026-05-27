// watch CLI 入力の Zod スキーマと parse ヘルパー。
// --max-retries は "infinite" を明示的に opt-in した場合のみ無限化する。
import { z } from "zod";
import { EXIT } from "../../exit-codes.js";
import type { Result } from "../../types.js";
import type { ParsedValues } from "../handler-types.js";
import { valStr } from "../handler-types.js";

// 既定値。誤起動で永続リトライしないための安全弁
export const MAX_RETRIES_DEFAULT = 100;

export const MaxRetriesSchema = z.string().transform((s, ctx) => {
  if (s === "infinite") return Number.POSITIVE_INFINITY;
  if (!/^\d+$/.test(s)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `max-retries must be a non-negative integer or "infinite"`,
    });
    return z.NEVER;
  }
  return Number(s);
});

export function parseMaxRetries(v: ParsedValues): Result<number> {
  const s = valStr(v, "max-retries");
  if (s === undefined) return { success: true, data: MAX_RETRIES_DEFAULT };
  const parsed = MaxRetriesSchema.safeParse(s);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
      exitCode: EXIT.PARAM,
    };
  }
  return { success: true, data: parsed.data };
}
