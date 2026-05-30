#!/usr/bin/env tsx
import { parseArgs } from "node:util";
import type { RuntimeContext } from "./commands/handler-types.js";
import { COMMON_OPTIONS } from "./common-options.js";
import { sanitizeErrorMessage } from "./error-sanitize.js";
import { EXIT, type ExitCode } from "./exit-codes.js";
import { showHelp, showPaperHelp, showProfileHelp, showTradeHelp } from "./help-print.js";
import { machineOutput } from "./output.js";
import { handleSpecialCommand, resolveCommand, runCommandHelp } from "./router.js";
import { resolveStartupCredentials } from "./startup-credentials.js";
import type { Format } from "./types.js";
import { unknownLongFlags } from "./unknown-flags.js";

function fail(machine: boolean, msg: string, code: ExitCode): void {
  if (machine) machineOutput({ success: false, error: msg, exitCode: code });
  else {
    process.stderr.write(`Error: ${msg}\n`);
    process.exitCode = code;
  }
}

async function main(): Promise<void> {
  const { positionals: p1 } = parseArgs({
    allowPositionals: true,
    options: COMMON_OPTIONS,
    strict: false,
  });
  if (p1.length === 0) {
    showHelp();
    return;
  }

  const { isTrade, isPaper, isProfile, command, entry } = resolveCommand(p1);
  const merged = { ...COMMON_OPTIONS, ...(entry?.options ?? {}) };
  const { values, positionals, tokens } = parseArgs({
    allowPositionals: true,
    options: merged,
    strict: false,
    tokens: true,
  });
  const machine = values.machine === true;
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
  const ctx: RuntimeContext = { credentials: credsResult.data };
  const format = (values.format ?? "json") as Format;
  if (!["json", "table", "csv"].includes(format)) {
    fail(machine, `Unknown format "${format}". Use json, table, or csv.`, EXIT.PARAM);
    return;
  }

  if (isTrade || isPaper || isProfile) {
    const label = isTrade ? "trade" : isPaper ? "paper" : "profile";
    if (!command) {
      if (isTrade) showTradeHelp();
      else if (isPaper) showPaperHelp();
      else showProfileHelp();
      return;
    }
    if (!entry) {
      fail(
        machine,
        `Unknown ${label} subcommand "${command}". Run 'bitbank ${label}' for the list.`,
        EXIT.PARAM,
      );
      return;
    }
    if (values.help && (await runCommandHelp(command, entry.description))) return;
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
  if (values.help && command && (await runCommandHelp(command, entry.description))) return;
  await entry.handler(args, opts, format, ctx);
}

main().catch((e: unknown) => {
  process.stderr.write(`Fatal: ${sanitizeErrorMessage(e)}\n`);
  process.exit(EXIT.GENERAL);
});
