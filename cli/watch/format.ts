import { z } from "zod";
import { nullableNumStr } from "../schema-helpers.js";

export const TickerDataSchema = z.object({
  ts: z.string(),
  pair: z.string(),
  last: nullableNumStr,
  bid: nullableNumStr,
  ask: nullableNumStr,
  high: nullableNumStr,
  low: nullableNumStr,
  vol: nullableNumStr,
});
export type TickerData = z.infer<typeof TickerDataSchema>;

export const WatchFormatSchema = z.enum(["json", "table"]);
export type WatchFormat = z.infer<typeof WatchFormatSchema>;

export type PairInfo = { priceDecimals: number; amountDecimals: number };

export function formatJsonl(t: TickerData): string {
  return JSON.stringify(t);
}

const ANSI_CLEAR_LINE = "\x1b[2K\r";
const ANSI_CURSOR_UP = "\x1b[1A";

export type TickerWriter = (t: TickerData) => void;

function fmtNum(n: number | null, decimals: number | undefined): string {
  if (n === null) return "-";
  return decimals === undefined ? String(n) : n.toFixed(decimals);
}

export function createJsonlWriter(): TickerWriter {
  return (t) => process.stdout.write(`${formatJsonl(t)}\n`);
}

export function createTableWriter(pair?: PairInfo): TickerWriter {
  let drawn = false;
  return (t) => {
    const time = t.ts.length >= 19 ? t.ts.slice(11, 19) : t.ts;
    const p = (n: number | null) => fmtNum(n, pair?.priceDecimals);
    const a = (n: number | null) => fmtNum(n, pair?.amountDecimals);
    const line =
      `${t.pair}  last=${p(t.last)}  bid=${p(t.bid)}  ask=${p(t.ask)}  ` +
      `high=${p(t.high)}  low=${p(t.low)}  vol=${a(t.vol)}  @${time}`;
    const out = drawn ? `${ANSI_CURSOR_UP}${ANSI_CLEAR_LINE}${line}\n` : `${line}\n`;
    process.stdout.write(out);
    drawn = true;
  };
}

export function createWriter(fmt: WatchFormat, pair?: PairInfo): TickerWriter {
  return fmt === "table" ? createTableWriter(pair) : createJsonlWriter();
}
