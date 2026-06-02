import type { CommandEntry } from "./handler-types.js";
import { paperCommands } from "./paper-handlers.js";
import { privateCommands } from "./private-handlers.js";
import { privateTransferCommands } from "./private-transfer-handlers.js";
import { profileCommands } from "./profile-handlers.js";
import { publicCommands } from "./public-handlers.js";
import { streamCommands } from "./stream-handler.js";
import { tradeCommands } from "./trade-handlers.js";
import { watchCommands } from "./watch-handler.js";

export const COMMANDS: Record<string, CommandEntry> = {
  ...publicCommands,
  ...privateCommands,
  ...privateTransferCommands,
  ...streamCommands,
  ...watchCommands,
};

export const TRADE_COMMANDS: Record<string, CommandEntry> = { ...tradeCommands };

export const PAPER_COMMANDS: Record<string, CommandEntry> = { ...paperCommands };

export const PROFILE_COMMANDS: Record<string, CommandEntry> = { ...profileCommands };

/** Flat description map keyed the way the schema command expects: bare name for
 *  public/private/stream, "<group> <name>" for trade/paper/profile subcommands.
 *  Single source for both router.ts (schema command) and scripts/gen-agents-catalog.ts. */
export function commandDescriptions(): Record<string, string> {
  return Object.fromEntries([
    ...Object.entries(COMMANDS).map(([k, v]) => [k, v.description] as const),
    ...Object.entries(TRADE_COMMANDS).map(([k, v]) => [`trade ${k}`, v.description] as const),
    ...Object.entries(PAPER_COMMANDS).map(([k, v]) => [`paper ${k}`, v.description] as const),
    ...Object.entries(PROFILE_COMMANDS).map(([k, v]) => [`profile ${k}`, v.description] as const),
  ]);
}
