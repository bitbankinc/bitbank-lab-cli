import { z } from "zod";

function parseFinite(v: string, ctx: z.RefinementCtx): number | typeof z.NEVER {
  // Number("") === 0 / Number(" ") === 0 を弾くため明示的に空文字をチェック
  if (v.trim() === "") {
    ctx.addIssue({ code: "custom", message: `not a finite number: "${v}"` });
    return z.NEVER;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) {
    ctx.addIssue({ code: "custom", message: `not a finite number: "${v}"` });
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

/** 十進文字列のまま保持する数値フィールド用（税務経路・ADR-005）。
 *  `numStr` と違い **number 化しない**。float を経由すると有効桁が落ち、
 *  v2 付録F の「厳密値を保持し丸めは境界で 1 回だけ」が成立しなくなるため。
 *  読み取りは `cli/tax/ratio-decimal.ts` の `fromDecimalString` が行う。 */
export const decStr = z.string().regex(/^-?\d+(\.\d+)?$/, "decimal string required");

/** ID フィールド用。安全整数（< 2^53）のみ許容し、超過は loud に reject。
 *  bitbank は ID を数値 JSON で返すため JSON.parse 段階の桁落ちを検知できる。 */
export const safeId = z.number().refine(Number.isSafeInteger, {
  error: "id is not a safe integer (>= 2^53); precision may be lost",
});
