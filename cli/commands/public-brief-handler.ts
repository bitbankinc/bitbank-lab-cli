// periodical-brief の登録。public-handlers.ts と分けているのは、ダイジェストを
// `--format=table` で **3 行テキストのまま**出す独自の出力経路を持つため
// （paper pnl の formatPnl と同じ扱い）。json / --machine は他コマンドと同じ envelope。
import { output } from "../output.js";
import type { CommandEntry, ParsedValues } from "./handler-types.js";
import { bool, str, valStr } from "./handler-types.js";
import { withRequestContext } from "./request-context.js";

const MODULE = "./public/periodical-brief.js";

function extract(args: string[], v: ParsedValues) {
  const flagPairs = valStr(v, "pairs")
    ?.split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  return {
    pairs: [...args, ...(flagPairs ?? [])],
    top: valStr(v, "top"),
    all: v.all === true,
    concurrency: valStr(v, "concurrency"),
    noCache: v["no-cache"] === true,
  };
}

const briefHandler: CommandEntry["handler"] = async (args, values, format, ctx) => {
  const mod: typeof import("./public/periodical-brief.js") = await import(MODULE);
  const params = extract(args, values);
  const result = withRequestContext(
    await mod.periodicalBrief(params),
    MODULE,
    params,
    ctx?.command,
  );
  // table は「表」ではなくダイジェスト本文をそのまま出す（人間 / cron 向け）。
  if (format === "table" && values.machine !== true && result.success) {
    if (result.partial)
      process.stderr.write("Warning: partial data returned (some pairs failed)\n");
    process.stdout.write(`${result.data.text}\n`);
    return;
  }
  output(result, format, values.raw === true, values.machine === true);
};

export const publicBriefCommands: Record<string, CommandEntry> = {
  "periodical-brief": {
    description:
      "3-line trading digest per pair (price, RSI/MACD/SMA trend, weekday volume, ATR) from confirmed daily candles",
    options: {
      pairs: str,
      top: str,
      all: bool(),
      concurrency: str,
      "no-cache": bool(),
    },
    handler: briefHandler,
  },
};
