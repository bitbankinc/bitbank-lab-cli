import type { z } from "zod";
import { CircuitBreakStreamSchema } from "./circuit-break.js";
import { DepthStreamSchema } from "./depth.js";
import { TickerStreamSchema } from "./ticker.js";
import { TransactionsStreamSchema } from "./transactions.js";

// channel prefix → schema のレジストリ。`startsWith` で room name の suffix を許容する。
const PARSERS: Array<{ prefix: string; schema: z.ZodType<unknown, z.ZodTypeDef, unknown> }> = [
  { prefix: "ticker_", schema: TickerStreamSchema },
  { prefix: "transactions_", schema: TransactionsStreamSchema },
  { prefix: "depth_diff_", schema: DepthStreamSchema },
  { prefix: "depth_whole_", schema: DepthStreamSchema },
  { prefix: "circuit_break_info_", schema: CircuitBreakStreamSchema },
];

export type ParseResult = {
  data: unknown;
  warning?: string;
};

export function parseChannelData(channel: string, raw: unknown): ParseResult {
  for (const { prefix, schema } of PARSERS) {
    if (channel.startsWith(prefix)) {
      const parsed = schema.safeParse(raw);
      if (parsed.success) return { data: parsed.data };
      return {
        data: raw,
        warning: `Schema mismatch on ${channel}: ${parsed.error.message}. Falling back to raw.`,
      };
    }
  }
  return {
    data: raw,
    warning: `Unknown channel ${channel}: no schema registered. Falling back to raw.`,
  };
}
