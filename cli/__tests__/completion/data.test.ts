import { describe, expect, it } from "vitest";
import { COMMANDS, PAPER_COMMANDS, TRADE_COMMANDS } from "../../commands/registry.js";
import { buildCompletionData } from "../../completion/data.js";

describe("buildCompletionData", () => {
  const d = buildCompletionData();

  it("includes every registered top-level command", () => {
    for (const name of Object.keys(COMMANDS)) {
      expect(d.topLevel, `missing ${name}`).toContain(name);
    }
  });

  it("includes the meta commands trade / paper / completion / profiles / schema", () => {
    for (const name of ["trade", "paper", "completion", "profiles", "schema"]) {
      expect(d.topLevel).toContain(name);
    }
  });

  it("includes every trade subcommand", () => {
    for (const name of Object.keys(TRADE_COMMANDS)) {
      expect(d.tradeSubcommands).toContain(name);
    }
  });

  it("includes every paper subcommand", () => {
    for (const name of Object.keys(PAPER_COMMANDS)) {
      expect(d.paperSubcommands).toContain(name);
    }
  });

  it("derives pair-taking commands from registry options", () => {
    expect(d.pairCommands).toContain("ticker");
    expect(d.pairCommands).toContain("depth");
    expect(d.pairCommands).toContain("candles");
    // tickers (no pair) should not be in pair-list
    expect(d.pairCommands).not.toContain("tickers");
    expect(d.pairCommands).not.toContain("status");
  });

  it("derives pair-taking trade subcommands", () => {
    expect(d.pairTradeSubcommands).toContain("create-order");
    expect(d.pairTradeSubcommands).toContain("cancel-order");
  });

  it("formats are exactly json/table/csv", () => {
    expect(d.formats).toEqual(["json", "table", "csv"]);
  });

  it("pairs include common majors and exclude unknowns", () => {
    expect(d.pairs).toContain("btc_jpy");
    expect(d.pairs).toContain("eth_jpy");
    expect(d.pairs).toContain("xrp_jpy");
    expect(d.pairs).not.toContain("matic_jpy"); // delisted
  });
});
