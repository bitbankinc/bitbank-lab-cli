import { z } from "zod";
import { EXIT } from "./exit-codes.js";
import type { Result } from "./types.js";

function msg(field: string, example: string): string {
  return `${field} is required. Example: ${example}`;
}

// Option-style (--flag=value)
export const MSG_PAIR = msg("pair", "--pair=btc_jpy");
export const MSG_ASSET = msg("asset", "--asset=btc");
export const MSG_ORDER_ID = msg("order-id", "--order-id=12345");
export const MSG_ORDER_IDS = msg("order-ids", "--order-ids=1,2,3");
export const MSG_ORDER_IDS_INFO = msg("order-ids", "--order-ids=123,456");
export const MSG_UUID = msg("uuid", "--uuid=xxx-yyy");
export const MSG_AMOUNT = msg("amount", "--amount=0.5");
export const MSG_ID = msg("id", "--id=12345");

// Positional-style (npx bitbank <cmd> <pair>)
export const MSG_PAIR_TICKER = msg("pair", "npx bitbank ticker btc_jpy");
export const MSG_PAIR_DEPTH = msg("pair", "npx bitbank depth btc_jpy");
export const MSG_PAIR_TRANSACTIONS = msg("pair", "npx bitbank transactions btc_jpy");
export const MSG_PAIR_CIRCUIT_BREAK = msg("pair", "npx bitbank circuit-break btc_jpy");

export function requireField<T>(value: T | undefined | null, message: string): Result<T> {
  if (!value) return { success: false, error: message };
  return { success: true, data: value };
}

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => i.message).join("; ");
}

export const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const PairSchema = z
  .string({ required_error: MSG_PAIR })
  .trim()
  .min(1, MSG_PAIR)
  .regex(/^[a-z0-9]+_[a-z0-9]+$/, "pair must be like btc_jpy");

export const AssetSchema = z
  .string({ required_error: MSG_ASSET })
  .trim()
  .min(1, MSG_ASSET)
  .regex(/^[a-z0-9]+$/, "asset must be alphanumeric (lowercase)");

export const UuidSchema = z
  .string({ required_error: MSG_UUID })
  .trim()
  .min(1, MSG_UUID)
  .regex(UUID_RE, "uuid must be a valid UUID");

export const PositiveDecimalSchema = z
  .string({ required_error: MSG_AMOUNT })
  .trim()
  .min(1, MSG_AMOUNT)
  .regex(/^\d+(\.\d+)?$/, "amount must be a positive decimal (no exponent/sign)")
  .refine((v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0;
  }, "amount must be > 0 and finite");

export const IntegerStringSchema = z
  .string({ required_error: MSG_ID })
  .trim()
  .min(1, MSG_ID)
  .regex(/^[1-9]\d*$/, "id must be a positive integer");

export function validatePair(
  pair: string | undefined,
  missingMessage: string = MSG_PAIR,
): Result<string> {
  if (!pair) return { success: false, error: missingMessage, exitCode: EXIT.PARAM };
  const parsed = PairSchema.safeParse(pair);
  if (!parsed.success) {
    return {
      success: false,
      error: formatZodError(parsed.error),
      exitCode: EXIT.PARAM,
    };
  }
  return { success: true, data: parsed.data };
}
