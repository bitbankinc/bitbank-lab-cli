import { z } from "zod";
import { numStr } from "../../../schema-helpers.js";

// WS transactions_<pair> は REST /transactions と同じく { transactions: [...] } を返す。
// REST の TransactionSchema をベースに、ストリーム特有の追加フィールドは passthrough。
const TransactionStreamItemSchema = z
  .object({
    transaction_id: z.number(),
    side: z.string(),
    price: numStr,
    amount: numStr,
    executed_at: z.number(),
  })
  .passthrough();

export const TransactionsStreamSchema = z
  .object({
    transactions: z.array(TransactionStreamItemSchema),
  })
  .passthrough();
