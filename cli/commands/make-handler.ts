import { homedir } from "node:os";
import { join } from "node:path";
import { output } from "../output.js";
import { buildLogRecord, writeTradeLog } from "../trade-log.js";
import type { CommandHandler, ParsedValues, RuntimeContext } from "./handler-types.js";
import { valStr } from "./handler-types.js";

const DEFAULT_TRADE_LOG = join(homedir(), ".bitbank-trade.log");

function ctxOpts(
  ctx?: RuntimeContext,
): { credentials: NonNullable<RuntimeContext["credentials"]> } | undefined {
  return ctx?.credentials ? { credentials: ctx.credentials } : undefined;
}

/** Public/Private 用: module を動的 import して fn(params, opts) → output */
export function handler(
  modulePath: string,
  fnName: string,
  extract: (args: string[], values: ParsedValues) => Record<string, unknown>,
): CommandHandler {
  return async (args, values, fmt, ctx) => {
    const mod = await import(modulePath);
    const params = extract(args, values);
    const opts = ctxOpts(ctx);
    const result =
      Object.keys(params).length > 0 ? await mod[fnName](params, opts) : await mod[fnName](opts);
    output(result, fmt, values.raw === true, values.machine === true);
  };
}

function isDryRun(r: { success: boolean; data?: unknown }): boolean {
  return r.success && typeof r.data === "object" && r.data !== null && "dryRun" in r.data;
}

/** Trade 用: module を動的 import して fn(params, opts) → isDryRun check → output + log */
export function tradeHandler(
  modulePath: string,
  fnName: string,
  extract: (values: ParsedValues) => Record<string, unknown>,
): CommandHandler {
  return async (_a, values, fmt, ctx) => {
    const mod = await import(modulePath);
    const params = extract(values);
    const opts = ctxOpts(ctx);
    const r = await mod[fnName](params, opts);
    if (isDryRun(r)) return;
    output(r, fmt, values.raw === true, values.machine === true);
    if (values["no-log"] !== true) {
      const logFile = valStr(values, "log-file") ?? DEFAULT_TRADE_LOG;
      const logResult = await writeTradeLog(logFile, buildLogRecord(fnName, params, r));
      if (!logResult.success) {
        process.stderr.write(`${logResult.error}\n`);
      }
    }
  };
}
