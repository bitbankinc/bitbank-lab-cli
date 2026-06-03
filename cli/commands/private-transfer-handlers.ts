import type { CommandEntry } from "./handler-types.js";
import { str, valStr } from "./handler-types.js";
import { handler } from "./make-handler.js";

export const privateTransferCommands: Record<string, CommandEntry> = {
  "deposit-history": {
    description: "Get deposit history",
    options: { asset: str, count: str, since: str, end: str },
    handler: handler("./private/deposit-history.js", "depositHistory", (_a, v) => ({
      asset: valStr(v, "asset"),
      count: valStr(v, "count"),
      since: valStr(v, "since"),
      end: valStr(v, "end"),
    })),
  },
  "unconfirmed-deposits": {
    description: "Get unconfirmed deposits",
    options: { asset: str },
    handler: handler("./private/unconfirmed-deposits.js", "unconfirmedDeposits", (_a, v) => ({
      asset: valStr(v, "asset"),
    })),
  },
  "deposit-originators": {
    // docs の Parameters は None。オプションを取らず params も送らない。
    description: "Get deposit originators",
    options: {},
    handler: handler("./private/deposit-originators.js", "depositOriginators", () => ({})),
  },
  "withdrawal-accounts": {
    description: "Get registered withdrawal accounts",
    options: { asset: str },
    handler: handler("./private/withdrawal-accounts.js", "withdrawalAccounts", (_a, v) => ({
      asset: valStr(v, "asset"),
    })),
  },
  "withdrawal-history": {
    description: "Get withdrawal history",
    options: { asset: str, count: str, since: str, end: str },
    handler: handler("./private/withdrawal-history.js", "withdrawalHistory", (_a, v) => ({
      asset: valStr(v, "asset"),
      count: valStr(v, "count"),
      since: valStr(v, "since"),
      end: valStr(v, "end"),
    })),
  },
};
