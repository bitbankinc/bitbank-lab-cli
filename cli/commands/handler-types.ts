import type { ApiCredentials } from "../auth.js";
import type { Format } from "../types.js";

export type ParsedValues = Record<string, string | boolean | undefined>;

/** Narrow a ParsedValues entry to string | undefined (never boolean). */
export function valStr(v: ParsedValues, key: string): string | undefined {
  const val = v[key];
  return typeof val === "string" ? val : undefined;
}

/** Runtime context threaded from CLI entry to command handlers.
 * credentials が undefined の場合、private API は呼べない（HTTP helper 側で
 * resolveCredentials() フォールバックも切れているため、明示エラーになる）。
 * command は router が解決した CLI コマンド名。meta.request.command のラベルの
 * 単一ソース（実装ファイル名はコマンド名と一致しないことがある）。 */
export type RuntimeContext = {
  credentials?: ApiCredentials;
  command?: string;
};

export type CommandHandler = (
  args: string[],
  values: ParsedValues,
  format: Format,
  ctx?: RuntimeContext,
) => Promise<void>;

export type CliOptionConfig = {
  type: "string" | "boolean";
  default?: string | boolean;
};

export const str: CliOptionConfig = { type: "string" };
export const bool = (d = false): CliOptionConfig => ({ type: "boolean", default: d });

export type CliOptions = Record<string, CliOptionConfig>;

export type CommandEntry = {
  description: string;
  handler: CommandHandler;
  options?: CliOptions;
};
