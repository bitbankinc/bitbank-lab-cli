import { describe, expect, it } from "vitest";
import { COMMANDS, TRADE_COMMANDS } from "../commands/registry.js";

describe("COMMANDS registry", () => {
  it("includes public commands", () => {
    expect(COMMANDS.ticker).toBeDefined();
    expect(COMMANDS.ticker.description).toContain("ticker");
    expect(COMMANDS.depth).toBeDefined();
    expect(COMMANDS.candles).toBeDefined();
    expect(COMMANDS.status).toBeDefined();
    expect(COMMANDS.pairs).toBeDefined();
  });

  it("includes private commands", () => {
    expect(COMMANDS.assets).toBeDefined();
    expect(COMMANDS.order).toBeDefined();
    expect(COMMANDS["active-orders"]).toBeDefined();
    expect(COMMANDS["trade-history"]).toBeDefined();
  });

  it("does not include trade commands in flat COMMANDS", () => {
    expect(COMMANDS["create-order"]).toBeUndefined();
    expect(COMMANDS["cancel-order"]).toBeUndefined();
  });

  it("includes stream command", () => {
    expect(COMMANDS.stream).toBeDefined();
    expect(COMMANDS.stream.description).toContain("stream");
  });

  it("all entries have description and handler", () => {
    for (const [name, entry] of Object.entries(COMMANDS)) {
      expect(entry.description, `${name} missing description`).toBeTruthy();
      expect(typeof entry.handler, `${name} handler not a function`).toBe("function");
    }
  });
});

describe("TRADE_COMMANDS registry", () => {
  it("includes all trade subcommands", () => {
    expect(TRADE_COMMANDS["create-order"]).toBeDefined();
    expect(TRADE_COMMANDS["cancel-order"]).toBeDefined();
    expect(TRADE_COMMANDS["cancel-orders"]).toBeDefined();
    expect(TRADE_COMMANDS["confirm-deposits"]).toBeDefined();
    expect(TRADE_COMMANDS["confirm-deposits-all"]).toBeDefined();
  });

  it("all entries have description and handler", () => {
    for (const [name, entry] of Object.entries(TRADE_COMMANDS)) {
      expect(entry.description, `${name} missing description`).toBeTruthy();
      expect(typeof entry.handler, `${name} handler not a function`).toBe("function");
    }
  });
});
