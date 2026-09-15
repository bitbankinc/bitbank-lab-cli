import {
  COMMANDS,
  PAPER_COMMANDS,
  PROFILE_COMMANDS,
  TAX_COMMANDS,
  TRADE_COMMANDS,
} from "./commands/registry.js";
import type { SubcommandGroup } from "./router.js";

/** サブコマンドグループのヘルプ。index.ts 側の分岐をここに閉じ込める。 */
export function showGroupHelp(group: SubcommandGroup): void {
  if (group === "trade") showTradeHelp();
  else if (group === "paper") showPaperHelp();
  else if (group === "profile") showProfileHelp();
  else showTaxHelp();
}

export function showHelp(): void {
  console.log("Usage: bitbank <command> [options]\n");
  console.log("Commands:");
  console.log(`  ${"schema".padEnd(24)} Show command schemas (JSON Schema format)`);
  console.log(`  ${"profiles".padEnd(24)} List legacy .env.* profile files`);
  console.log(`  ${"completion <shell>".padEnd(24)} Print shell completion script (bash | zsh)`);
  for (const [name, { description }] of Object.entries(COMMANDS)) {
    console.log(`  ${name.padEnd(24)} ${description}`);
  }
  console.log(
    `  ${"trade <subcommand>".padEnd(24)} Fund-affecting operations (run 'bitbank trade' for list)`,
  );
  console.log(
    `  ${"paper <subcommand>".padEnd(24)} Paper trading sim (run 'bitbank paper' for list)`,
  );
  console.log(
    `  ${"profile <subcommand>".padEnd(24)} Manage credential profiles (run 'bitbank profile' for list)`,
  );
  console.log(
    `  ${"tax <subcommand>".padEnd(24)} Tax/accounting reference data (run 'bitbank tax' for list)`,
  );
  console.log("\nOptions:");
  console.log("  --profile=<name>         Use named profile (profiles.json or .env.<name>)");
  console.log("  --format=json|table|csv  Output format (default: json)");
  console.log("  --machine                Machine-readable JSON envelope on stdout");
  console.log("  --raw                    Output data only (compact, no envelope/meta)");
  console.log("  --log-file=<path>        Trade audit log path (default: ~/.bitbank-trade.log)");
  console.log("  --no-log                 Skip writing the trade audit log");
  console.log("  --help                   Show this help");
  console.log("  --version, -v            Print the installed CLI version");
}

export function showTradeHelp(): void {
  console.log("Usage: bitbank trade <subcommand> [options]\n");
  console.log("Fund-affecting operations. All default to dry-run; use --execute to send.\n");
  console.log("Subcommands:");
  for (const [name, { description }] of Object.entries(TRADE_COMMANDS)) {
    console.log(`  ${name.padEnd(24)} ${description}`);
  }
  console.log("\nRun 'bitbank trade <subcommand> --help' for subcommand options.");
}

export function showPaperHelp(): void {
  console.log("Usage: bitbank paper <subcommand> [options]\n");
  console.log(
    "Paper trading sim. Uses live public ticker for pricing — no private/trade API calls.\n",
  );
  console.log("Subcommands:");
  for (const [name, { description }] of Object.entries(PAPER_COMMANDS)) {
    console.log(`  ${name.padEnd(24)} ${description}`);
  }
  console.log("\nRun 'bitbank paper <subcommand> --help' for subcommand options.");
}

export function showTaxHelp(): void {
  console.log("Usage: bitbank tax <subcommand> [options]\n");
  console.log(
    "Tax/accounting reference data. Private GET only — never POST. Output is reference\n" +
      "data for tax computation, NOT a taxable income figure.\n",
  );
  console.log("Subcommands:");
  for (const [name, { description }] of Object.entries(TAX_COMMANDS)) {
    console.log(`  ${name.padEnd(24)} ${description}`);
  }
  console.log("\nRun 'bitbank tax <subcommand> --help' for subcommand options.");
}

export function showProfileHelp(): void {
  console.log("Usage: bitbank profile <subcommand> [options]\n");
  console.log("Manage credential profiles stored in profiles.json (0600).\n");
  console.log("Subcommands:");
  for (const [name, { description }] of Object.entries(PROFILE_COMMANDS)) {
    console.log(`  ${name.padEnd(24)} ${description}`);
  }
  console.log(
    '\nSecrets are entered interactively (hidden) or read from "BITBANK_API_SECRET" env.',
  );
}
