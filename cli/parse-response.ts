import type { z } from "zod";
import type { Result } from "./types.js";

export function parseResponse<T>(result: Result<unknown>, schema: z.ZodType<T, unknown>): Result<T>;
export function parseResponse<T, K extends keyof T>(
  result: Result<unknown>,
  schema: z.ZodType<T, unknown>,
  key: K,
): Result<T[K]>;
export function parseResponse<T, K extends keyof T>(
  result: Result<unknown>,
  schema: z.ZodType<T, unknown>,
  key?: K,
): Result<T> | Result<T[K]> {
  if (!result.success) return result;
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) {
    return { success: false, error: `Invalid response: ${parsed.error.message}` };
  }
  // 入力 result の partial / meta（http-core が付けた rateLimit 等）を引き継ぐ。
  // ここで捨てると ticker/depth/transactions 等で meta.rateLimit が消える。
  const passthrough = {
    ...(result.partial && { partial: true as const }),
    ...(result.meta && { meta: result.meta }),
  };
  if (key != null) {
    return { success: true, data: parsed.data[key], ...passthrough };
  }
  return { success: true, data: parsed.data, ...passthrough };
}
