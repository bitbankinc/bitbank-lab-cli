import { z } from "zod";

export const TickerDataSchema = z.object({
  ts: z.string(),
  pair: z.string(),
  last: z.string(),
  bid: z.string(),
  ask: z.string(),
  high: z.string(),
  low: z.string(),
  vol: z.string(),
});
export type TickerData = z.infer<typeof TickerDataSchema>;

export const WatchFormatSchema = z.enum(["json", "table"]);
export type WatchFormat = z.infer<typeof WatchFormatSchema>;

export function formatJsonl(t: TickerData): string {
  return JSON.stringify(t);
}

const ANSI_CLEAR_LINE = "\x1b[2K\r";
const ANSI_CURSOR_UP = "\x1b[1A";

export type TickerWriter = (t: TickerData) => void;

export function createJsonlWriter(): TickerWriter {
  return (t) => process.stdout.write(`${formatJsonl(t)}\n`);
}

export function createTableWriter(): TickerWriter {
  let drawn = false;
  return (t) => {
    const time = t.ts.length >= 19 ? t.ts.slice(11, 19) : t.ts;
    const line =
      `${t.pair}  last=${t.last}  bid=${t.bid}  ask=${t.ask}  ` +
      `high=${t.high}  low=${t.low}  vol=${t.vol}  @${time}`;
    const out = drawn ? `${ANSI_CURSOR_UP}${ANSI_CLEAR_LINE}${line}\n` : `${line}\n`;
    process.stdout.write(out);
    drawn = true;
  };
}

export function createWriter(fmt: WatchFormat): TickerWriter {
  return fmt === "table" ? createTableWriter() : createJsonlWriter();
}
