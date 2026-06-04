import type { CommandEntry } from "./commands/handler-types.js";
import {
  COMMANDS,
  commandDescriptions,
  PAPER_COMMANDS,
  PROFILE_COMMANDS,
  TRADE_COMMANDS,
} from "./commands/registry.js";
import type { Format } from "./types.js";

export type ResolvedCommand = {
  isTrade: boolean;
  isPaper: boolean;
  isProfile: boolean;
  command: string | undefined;
  entry: CommandEntry | undefined;
};

export function resolveCommand(positionals: string[]): ResolvedCommand {
  const isTrade = positionals[0] === "trade";
  const isPaper = positionals[0] === "paper";
  const isProfile = positionals[0] === "profile";
  const isSub = isTrade || isPaper || isProfile;
  const command = isSub ? positionals[1] : positionals[0];
  let entry: CommandEntry | undefined;
  if (isTrade) entry = command ? TRADE_COMMANDS[command] : undefined;
  else if (isPaper) entry = command ? PAPER_COMMANDS[command] : undefined;
  else if (isProfile) entry = command ? PROFILE_COMMANDS[command] : undefined;
  else entry = COMMANDS[command ?? ""];
  return { isTrade, isPaper, isProfile, command, entry };
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
  if (command === "completion") {
    const { completionHandler } = await import("./commands/completion/index.js");
    await completionHandler(args, opts, format);
    return true;
  }
  if (command === "schema") {
    const { buildSchemaHandler } = await import("./commands/schema/handler.js");
    await buildSchemaHandler(commandDescriptions())(args, opts, format);
    return true;
  }
  return false;
}

export async function runCommandHelp(command: string, description: string): Promise<boolean> {
  const { showCommandHelp } = await import("./commands/schema/help.js");
  return showCommandHelp(command, description);
}
