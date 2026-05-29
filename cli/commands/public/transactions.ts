import { z } from "zod";
import { type HttpOptions, publicGet } from "../../http.js";
import { parseResponse } from "../../parse-response.js";
import { numStr, safeId } from "../../schema-helpers.js";
import type { Result } from "../../types.js";
import { MSG_PAIR_TRANSACTIONS, validatePair } from "../../validators.js";

const TransactionSchema = z.object({
  transaction_id: safeId,
  side: z.string(),
  price: numStr,
  amount: numStr,
  executed_at: z.number(),
});

const TransactionsSchema = z.object({
  transactions: z.array(TransactionSchema),
});

export type Transaction = z.infer<typeof TransactionSchema>;

export async function transactions(
  args: { pair: string | undefined; date?: string },
  opts?: HttpOptions,
): Promise<Result<Transaction[]>> {
  const v = validatePair(args.pair, MSG_PAIR_TRANSACTIONS);
  if (!v.success) return v;
  const datePath = args.date ? `/${args.date}` : "";
  const result = await publicGet<unknown>(`/${v.data}/transactions${datePath}`, opts);
  return parseResponse(result, TransactionsSchema, "transactions");
}
