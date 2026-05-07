import type { ApiCredentials } from "../../auth.js";
import type { Result } from "../../types.js";
import type { StreamFormat } from "./format.js";

export type StreamArgs = {
  pair?: string;
  isPrivate: boolean;
  channel?: string;
  filter?: string;
  format: StreamFormat;
  credentials?: ApiCredentials;
};

export async function streamCommand(args: StreamArgs): Promise<Result<void>> {
  const format: StreamFormat = args.format === "table" ? "table" : "json";

  if (args.isPrivate) {
    const { startPrivateStream } = await import("./private.js");
    const filter = args.filter ? args.filter.split(",").map((s) => s.trim()) : undefined;
    const result = await startPrivateStream({ format, filter, credentials: args.credentials });
    if (!result.success) return result;
    setupShutdown(result.data.stop);
    return { success: true, data: undefined };
  }

  if (!args.pair) {
    return {
      success: false,
      error: "Pair is required for public stream. Usage: bitbank stream <pair>",
    };
  }

  const { startPublicStream } = await import("./public.js");
  const channels = args.channel ? args.channel.split(",").map((s) => s.trim()) : undefined;
  const result = startPublicStream({ pair: args.pair, channels, format });
  if (!result.success) return result;
  setupShutdown(result.data.stop);
  return { success: true, data: undefined };
}

function setupShutdown(stop: () => void): void {
  const handler = (): void => {
    process.stderr.write("\nShutting down stream...\n");
    stop();
    process.exit(0);
  };
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
}
