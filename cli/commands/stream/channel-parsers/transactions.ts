import { z } from "zod";
import { numStr, safeId } from "../../../schema-helpers.js";

// WS transactions_<pair> は REST /transactions と同じく { transactions: [...] } を返す。
// REST の TransactionSchema をベースに、ストリーム特有の追加フィールドは loose。
const TransactionStreamItemSchema = z
  .object({
    transaction_id: safeId,
    side: z.string(),
    price: numStr,
    amount: numStr,
    executed_at: z.number(),
  })
  .loose();

export const TransactionsStreamSchema = z
  .object({
    transactions: z.array(TransactionStreamItemSchema),
  })
  .loose();
