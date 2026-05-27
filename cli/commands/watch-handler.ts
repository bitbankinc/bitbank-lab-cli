import { EXIT } from "../exit-codes.js";
import { output } from "../output.js";
import type { Result } from "../types.js";
import type { WatchFormat } from "../watch/format.js";
import type { CommandEntry, ParsedValues } from "./handler-types.js";
import { str, valStr } from "./handler-types.js";
import { MAX_RETRIES_DEFAULT, parseMaxRetries } from "./watch/input-schemas.js";

function parseNum(
  v: ParsedValues,
  key: string,
  dflt: number | undefined,
): Result<number | undefined> {
  const s = valStr(v, key);
  if (s === undefined) return { success: true, data: dflt };
  const n = Number(s);
  if (!Number.isFinite(n)) {
    return {
      success: false,
      error: `Invalid --${key}: "${s}" is not a finite number`,
      exitCode: EXIT.PARAM,
    };
  }
  return { success: true, data: n };
}

function resolveFormat(fmt: string, isTty: boolean, explicit: boolean): WatchFormat {
  const wanted = fmt === "table" ? "table" : "json";
  if (!isTty && wanted === "table") {
    if (explicit) {
      process.stderr.write("Warning: stdout is not a TTY; falling back to json.\n");
    }
    return "json";
  }
  if (isTty && !explicit) return "table";
  return wanted;
}

function isExplicitFormat(argv: string[]): boolean {
  return argv.some((a) => a === "--format" || a.startsWith("--format="));
}

export const watchCommands: Record<string, CommandEntry> = {
  watch: {
    description: "Watch a real-time public channel (ticker only)",
    options: {
      duration: str,
      count: str,
      "idle-timeout": str,
      "max-retries": str,
      "backoff-cap": str,
    },
    handler: async (args, values, format) => {
      const fmt = resolveFormat(
        String(values.format ?? format),
        Boolean(process.stdout.isTTY),
        isExplicitFormat(process.argv.slice(2)),
      );
      const outFmt = fmt === "table" ? "json" : fmt;
      const nums = {
        duration: parseNum(values, "duration", undefined),
        count: parseNum(values, "count", undefined),
        idleTimeout: parseNum(values, "idle-timeout", 30),
        maxRetries: parseMaxRetries(values),
        backoffCap: parseNum(values, "backoff-cap", 32),
      };
      for (const r of Object.values(nums)) {
        if (!r.success) {
          output(r, outFmt);
          return;
        }
      }
      const { watchCommand } = await import("./watch/index.js");
      const r = await watchCommand({
        channel: args[0] ?? "",
        pair: args[1],
        format: fmt,
        duration: nums.duration.success ? nums.duration.data : undefined,
        count: nums.count.success ? nums.count.data : undefined,
        idleTimeout: (nums.idleTimeout.success ? nums.idleTimeout.data : 30) ?? 30,
        maxRetries: nums.maxRetries.success ? nums.maxRetries.data : MAX_RETRIES_DEFAULT,
        backoffCap: (nums.backoffCap.success ? nums.backoffCap.data : 32) ?? 32,
      });
      if (!r.success) output(r, outFmt);
    },
  },
};
