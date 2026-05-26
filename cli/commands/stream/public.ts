import { type Socket, io } from "socket.io-client";
import type { Result } from "../../types.js";
import { parseChannelData } from "./channel-parsers/index.js";
import { type StreamFormat, writeStreamMessage } from "./format.js";

// bitbank 公開 WebSocket エンドポイント
const WS_ENDPOINT = "wss://stream.bitbank.cc";

const PUBLIC_CHANNELS = [
  "ticker",
  "transactions",
  "depth_diff",
  "depth_whole",
  "circuit_break_info",
] as const;
type PublicChannel = (typeof PUBLIC_CHANNELS)[number];

export type PublicStreamOptions = {
  pair: string;
  channels?: string[];
  format: StreamFormat;
};

export function startPublicStream(opts: PublicStreamOptions): Result<{ stop: () => void }> {
  const resolved = resolveChannels(opts.pair, opts.channels);
  if (!resolved.success) return resolved;

  const socket: Socket = io(WS_ENDPOINT, { transports: ["websocket"] });

  socket.on("connect", () => {
    for (const ch of resolved.data) socket.emit("join-room", ch);
    process.stderr.write(`Connected. Subscribed: ${resolved.data.join(", ")}\n`);
  });

  const warned = new Set<string>();
  socket.on("message", (msg: { room_name: string; message: { data: unknown } }) => {
    const parsed = parseChannelData(msg.room_name, msg.message.data);
    if (parsed.warning && !warned.has(msg.room_name)) {
      warned.add(msg.room_name);
      process.stderr.write(`${parsed.warning}\n`);
    }
    writeStreamMessage(
      { channel: msg.room_name, timestamp: Date.now(), data: parsed.data },
      opts.format,
    );
  });

  socket.on("disconnect", (reason) => {
    process.stderr.write(`Disconnected: ${reason}\n`);
  });

  socket.on("connect_error", (err) => {
    process.stderr.write(`Connection error: ${err.message}\n`);
  });

  const stop = (): void => {
    for (const ch of resolved.data) socket.emit("leave-room", ch);
    socket.disconnect();
  };

  return { success: true, data: { stop } };
}

function resolveChannels(pair: string, filter?: string[]): Result<string[]> {
  if (filter && filter.length > 0) {
    const invalid = filter.filter((c) => !PUBLIC_CHANNELS.includes(c as PublicChannel));
    if (invalid.length > 0) {
      return {
        success: false,
        error: `Unknown channel(s): ${invalid.join(", ")}. Valid: ${PUBLIC_CHANNELS.join(", ")}`,
      };
    }
    return { success: true, data: filter.map((c) => `${c}_${pair}`) };
  }
  // Default: ticker + transactions + depth_diff
  return {
    success: true,
    data: [`ticker_${pair}`, `transactions_${pair}`, `depth_diff_${pair}`],
  };
}
