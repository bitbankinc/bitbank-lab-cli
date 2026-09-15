#!/usr/bin/env tsx
// 100行超: CLI エントリポイント。引数解析 → help → 未知フラグ → 認証解決 → format 検証
// → group 振り分け → special command → handler という起動順そのものが仕様なので、
// 途中で分割すると順序の担保が読めなくなる。個々の処理は各モジュールへ委譲済み。
import { parseArgs } from "node:util";
import type { RuntimeContext } from "./commands/handler-types.js";
import { COMMON_OPTIONS } from "./common-options.js";
import { sanitizeErrorMessage } from "./error-sanitize.js";
import { EXIT, type ExitCode } from "./exit-codes.js";
import { showGroupHelp, showHelp } from "./help-print.js";
import { machineOutput } from "./output.js";
import { handleSpecialCommand, resolveCommand, runCommandHelp } from "./router.js";
import { resolveStartupCredentials } from "./startup-credentials.js";
import type { Format, Result } from "./types.js";
import { unknownLongFlags } from "./unknown-flags.js";

function fail(machine: boolean, msg: string, code: ExitCode): void {
  if (machine) machineOutput({ success: false, error: msg, exitCode: code });
  else {
    process.stderr.write(`Error: ${msg}\n`);
    process.exitCode = code;
  }
}

/** `--help` は常にここで終端する。help を出せなくてもコマンド本体には落とさない。 */
function helpDone(r: Result<void>, machine: boolean): void {
  if (!r.success) fail(machine, r.error, r.exitCode ?? EXIT.PARAM);
}

async function main(): Promise<void> {
  const { positionals: p1, values: v1 } = parseArgs({
    allowPositionals: true,
    options: COMMON_OPTIONS,
    strict: false,
  });
  // `--version` / `-v` はコマンド解決より前に終端する（API・認証・format に触れない）。
  if (v1.version === true) {
    const { versionHandler } = await import("./commands/version.js");
    versionHandler(v1.machine === true);
    return;
  }
  if (p1.length === 0) {
    showHelp();
    return;
  }

  const { group, command, entry } = resolveCommand(p1);
  const merged = { ...COMMON_OPTIONS, ...(entry?.options ?? {}) };
  const { values, positionals, tokens } = parseArgs({
    allowPositionals: true,
    options: merged,
    strict: false,
    tokens: true,
  });
  const machine = values.machine === true;
  // `--help` は未知フラグ・認証・format 検証より先に返す。help は「正しい呼び出し方を
  // 知る」ための経路なので、他の入力が不正なときこそ読めないと困る。entry が無い
  // ケース（group 単体・special command・未知コマンド）は従来どおり後段が扱う。
  if (values.help && entry && command)
    return helpDone(await runCommandHelp(command, entry.description, group), machine);
  const unknown = unknownLongFlags(tokens, merged);
  if (unknown.length > 0) {
    const msg = `Unknown option(s): ${unknown.join(", ")}. Run with --help for usage.`;
    fail(machine, msg, EXIT.PARAM);
    return;
  }
  const profileFlag = typeof values.profile === "string" ? values.profile : undefined;
  const credsResult = resolveStartupCredentials(profileFlag);
  if (!credsResult.success) {
    fail(machine, credsResult.error, credsResult.exitCode ?? EXIT.GENERAL);
    return;
  }
  const ctx: RuntimeContext = { credentials: credsResult.data, command };
  const format = (values.format ?? "json") as Format;
  if (!["json", "table", "csv"].includes(format)) {
    fail(machine, `Unknown format "${format}". Use json, table, or csv.`, EXIT.PARAM);
    return;
  }

  if (group) {
    if (!command) {
      showGroupHelp(group);
      return;
    }
    if (!entry) {
      fail(
        machine,
        `Unknown ${group} subcommand "${command}". Run 'bitbank ${group}' for the list.`,
        EXIT.PARAM,
      );
      return;
    }
    const [, , ...subArgs] = positionals;
    const opts = values as Record<string, string | boolean | undefined>;
    await entry.handler(subArgs, opts, format, ctx);
    return;
  }

  const [, ...args] = positionals;
  const opts = values as Record<string, string | boolean | undefined>;
  if (command && (await handleSpecialCommand(command, args, opts, format))) return;
  if (!entry) {
    fail(machine, `Unknown command "${command}". Run with --help for usage.`, EXIT.PARAM);
    return;
  }
  await entry.handler(args, opts, format, ctx);
}

main().catch((e: unknown) => {
  process.stderr.write(`Fatal: ${sanitizeErrorMessage(e)}\n`);
  process.exit(EXIT.GENERAL);
});
