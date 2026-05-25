// 100行超: lifecycle / reconnect / socket / writer + table mode の pair decimals 解決を 1 場所で束ねる
import { EXIT } from "../../exit-codes.js";
import type { Result } from "../../types.js";
import { type PairInfo, type WatchFormat, createWriter } from "../../watch/format.js";
import { type LifecycleReason, setupLifecycle } from "../../watch/lifecycle.js";
import { type GetPairs, resolvePairInfo } from "../../watch/pair-info.js";
import { createReconnect } from "../../watch/reconnect.js";
import { type IoFactory, startTickerSocket } from "../../watch/ticker.js";

export type WatchArgs = {
  channel: string;
  pair?: string;
  format: WatchFormat;
  duration?: number;
  count?: number;
  idleTimeout: number;
  maxRetries: number;
  backoffCap: number;
  ioFactory?: IoFactory;
  getPairs?: GetPairs;
};

export async function watchCommand(args: WatchArgs): Promise<Result<void>> {
  if (args.channel !== "ticker") {
    return {
      success: false,
      error: `Unsupported channel "${args.channel}". Supported: ticker`,
      exitCode: EXIT.PARAM,
    };
  }
  if (!args.pair) {
    return {
      success: false,
      error: "Pair is required. Usage: bitbank watch ticker <pair>",
      exitCode: EXIT.PARAM,
    };
  }
  const info =
    args.format === "table" ? await resolvePairInfo(args.pair, args.getPairs) : undefined;
  return runWatch(args, args.pair, info);
}

function runWatch(
  args: WatchArgs,
  pair: string,
  info: PairInfo | undefined,
): Promise<Result<void>> {
  return new Promise((resolve) => {
    const write = createWriter(args.format, info);
    let settled = false;
    let reconnect: ReturnType<typeof createReconnect> | null = null;
    const settle = (r: Result<void>): void => {
      if (settled) return;
      settled = true;
      reconnect?.stop();
      lifecycle.teardown();
      resolve(r);
    };

    const lifecycle = setupLifecycle({
      duration: args.duration,
      count: args.count,
      onStop: (reason: LifecycleReason) => {
        process.stderr.write(`Stopped: ${reason}\n`);
        if (reason === "max-retries") {
          settle({
            success: false,
            error: `Reconnect failed after ${args.maxRetries} retries`,
            exitCode: EXIT.NETWORK,
          });
        } else settle({ success: true, data: undefined });
      },
    });

    reconnect = createReconnect({
      maxRetries: args.maxRetries,
      backoffCap: args.backoffCap,
      idleTimeout: args.idleTimeout,
      startConnection: () =>
        startTickerSocket(
          pair,
          {
            onTicker: (t) => {
              write(t);
              reconnect?.noteEvent();
              lifecycle.noteEvent();
            },
            onConnect: () => reconnect?.noteConnected(),
            onDisconnect: (reason) => reconnect?.noteDisconnect(reason),
          },
          args.ioFactory,
        ),
      onAttempt: (retry, wait) =>
        process.stderr.write(`Reconnecting (attempt ${retry}, wait ${wait}s)...\n`),
      onConnected: () => process.stderr.write(`Connected to ticker_${pair}\n`),
      onLost: (reason) => process.stderr.write(`Disconnected: ${reason}\n`),
      onIdle: () => process.stderr.write(`Idle timeout (${args.idleTimeout}s); reconnecting\n`),
      onMaxRetries: () => lifecycle.fail("max-retries"),
    });

    reconnect.start();
  });
}
