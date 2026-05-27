// private read 系コマンドの入力検証用スキーマ。
// 数値・タイムスタンプ・order は文字列のまま保持し、compactParams にそのまま渡す。
import { z } from "zod";

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
        code: z.ZodIssueCode.custom,
        message: "since must be ≤ end",
        path: ["since"],
      });
    }
  }
}

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => i.message).join("; ");
}
