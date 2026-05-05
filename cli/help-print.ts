import { COMMANDS, PAPER_COMMANDS, TRADE_COMMANDS } from "./commands/registry.js";

export function showHelp(): void {
  console.log("Usage: bitbank <command> [options]\n");
  console.log("Commands:");
  console.log(`  ${"schema".padEnd(24)} Show command schemas (JSON Schema format)`);
  console.log(`  ${"profiles".padEnd(24)} List available profiles (.env.* files)`);
  for (const [name, { description }] of Object.entries(COMMANDS)) {
    console.log(`  ${name.padEnd(24)} ${description}`);
  }
  console.log(
    `  ${"trade <subcommand>".padEnd(24)} Fund-affecting operations (run 'bitbank trade' for list)`,
  );
  console.log(
    `  ${"paper <subcommand>".padEnd(24)} Paper trading sim with virtual funds (run 'bitbank paper' for list)`,
  );
  console.log("\nOptions:");
  console.log("  --profile=<name>         Use .env.<name> for credentials");
  console.log("  --format=json|table|csv  Output format (default: json)");
  console.log("  --machine                Machine-readable JSON envelope on stdout");
  console.log("  --help                   Show this help");
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
