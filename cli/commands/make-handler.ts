import { homedir } from "node:os";
import { join } from "node:path";
import { output } from "../output.js";
import { isDryRunData } from "../output-dry-run.js";
import { buildLogRecord, writeTradeLog } from "../trade-log.js";
import type { CommandHandler, ParsedValues, RuntimeContext } from "./handler-types.js";
import { valStr } from "./handler-types.js";
import { withRequestContext } from "./request-context.js";

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
    // public / private のみ取得コンテキストを付与（paper / trade は素通し）。
    const withCtx = withRequestContext(result, modulePath, params, ctx?.command);
    output(withCtx, fmt, values.raw === true, values.machine === true);
  };
}

/** Trade 用: module を動的 import → output（dry-run も machine 分岐込みで通す）→ 実行時のみ監査ログ */
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
    const machine = values.machine === true;
    output(r, fmt, values.raw === true, machine);
    // dry-run は実行していないので監査ログを書かない。実行時（成功/失敗）のみ記録する。
    if ((r.success && isDryRunData(r.data)) || values["no-log"] === true) return;
    const logFile = valStr(values, "log-file") ?? DEFAULT_TRADE_LOG;
    const logResult = await writeTradeLog(logFile, buildLogRecord(fnName, params, r));
    // machine では stdout/stderr の機械可読性を保つため、非 JSON の警告行を stderr に出さない。
    if (!logResult.success && !machine) {
      process.stderr.write(`${logResult.error}\n`);
    }
  };
}
