import { io, type Socket } from "socket.io-client";
import { type TickerData, TickerDataSchema } from "./format.js";

const WS_ENDPOINT = "wss://stream.bitbank.cc";

export type TickerCallbacks = {
  onTicker: (t: TickerData) => void;
  onConnect: () => void;
  onDisconnect: (reason: string) => void;
};

type MinimalSocket = Pick<Socket, "on" | "emit" | "disconnect">;
export type IoFactory = (endpoint: string, opts: object) => MinimalSocket;

const defaultFactory: IoFactory = (endpoint, opts) => io(endpoint, opts) as MinimalSocket;

export function startTickerSocket(
  pair: string,
  cb: TickerCallbacks,
  ioFactory: IoFactory = defaultFactory,
): { stop: () => void } {
  const room = `ticker_${pair}`;
  const socket = ioFactory(WS_ENDPOINT, {
    transports: ["websocket"],
    reconnection: false,
  });

  socket.on("connect", () => {
    socket.emit("join-room", room);
    cb.onConnect();
  });

  socket.on(
    "message",
    (msg: { room_name: string; message?: { data?: Record<string, unknown> } }) => {
      if (msg.room_name !== room) return;
      if (!msg.message?.data) return;
      cb.onTicker(parseTicker(pair, msg.message.data));
    },
  );

  socket.on("disconnect", (reason: string) => cb.onDisconnect(String(reason)));
  socket.on("connect_error", (err: Error) => cb.onDisconnect(`connect_error: ${err.message}`));

  return {
    stop: () => {
      socket.emit("leave-room", room);
      socket.disconnect();
    },
  };
}

function coerceNum(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s.trim() === "" ? null : s;
}

export function parseTicker(pair: string, data: Record<string, unknown>): TickerData {
  const tsMs = typeof data.timestamp === "number" ? data.timestamp : Date.now();
  return TickerDataSchema.parse({
    ts: new Date(tsMs).toISOString(),
    pair,
    last: coerceNum(data.last),
    bid: coerceNum(data.buy),
    ask: coerceNum(data.sell),
    high: coerceNum(data.high),
    low: coerceNum(data.low),
    vol: coerceNum(data.vol),
  });
}
