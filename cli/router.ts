import type { CommandEntry } from "./commands/handler-types.js";
import { COMMANDS, PAPER_COMMANDS, TRADE_COMMANDS } from "./commands/registry.js";
import type { Format } from "./types.js";

export type ResolvedCommand = {
  isTrade: boolean;
  isPaper: boolean;
  command: string | undefined;
  entry: CommandEntry | undefined;
};

export function resolveCommand(positionals: string[]): ResolvedCommand {
  const isTrade = positionals[0] === "trade";
  const isPaper = positionals[0] === "paper";
  const command = isTrade || isPaper ? positionals[1] : positionals[0];
  let entry: CommandEntry | undefined;
  if (isTrade) entry = command ? TRADE_COMMANDS[command] : undefined;
  else if (isPaper) entry = command ? PAPER_COMMANDS[command] : undefined;
  else entry = COMMANDS[command ?? ""];
  return { isTrade, isPaper, command, entry };
}

export async function handleSpecialCommand(
  command: string,
  args: string[],
  opts: Record<string, string | boolean | undefined>,
  format: Format,
): Promise<boolean> {
  if (command === "profiles") {
    const { profilesHandler } = await import("./commands/profiles.js");
    await profilesHandler(args, opts, format);
    return true;
  }
  if (command === "schema") {
    const { buildSchemaHandler } = await import("./commands/schema/handler.js");
    const desc = Object.fromEntries([
      ...Object.entries(COMMANDS).map(([k, v]) => [k, v.description] as const),
      ...Object.entries(TRADE_COMMANDS).map(([k, v]) => [`trade ${k}`, v.description] as const),
      ...Object.entries(PAPER_COMMANDS).map(([k, v]) => [`paper ${k}`, v.description] as const),
    ]);
    await buildSchemaHandler(desc)(args, opts, format);
    return true;
  }
  return false;
}

export async function runCommandHelp(command: string, description: string): Promise<boolean> {
  const { showCommandHelp } = await import("./commands/schema/help.js");
  return showCommandHelp(command, description);
}
