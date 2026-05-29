import { z } from "zod";

function parseFinite(v: string, ctx: z.RefinementCtx): number | typeof z.NEVER {
  // Number("") === 0 / Number(" ") === 0 を弾くため明示的に空文字をチェック
  if (v.trim() === "") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `not a finite number: "${v}"` });
    return z.NEVER;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `not a finite number: "${v}"` });
    return z.NEVER;
  }
  return n;
}

/** API が文字列で返す数値フィールド用。空文字・NaN・Infinity は reject */
export const numStr = z.string().transform(parseFinite);

/** API が文字列 | null で返す数値フィールド用 */
export const nullableNumStr = z
  .string()
  .nullable()
  .transform((v, ctx) => (v === null ? null : parseFinite(v, ctx)));

/** ID フィールド用。安全整数（< 2^53）のみ許容し、超過は loud に reject。
 *  bitbank は ID を数値 JSON で返すため JSON.parse 段階の桁落ちを検知できる。 */
export const safeId = z.number().refine(Number.isSafeInteger, {
  message: "id is not a safe integer (>= 2^53); precision may be lost",
});
