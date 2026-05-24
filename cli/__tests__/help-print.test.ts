import { describe, expect, it, vi } from "vitest";
import { showHelp, showTradeHelp } from "../help-print.js";

function captureLog(fn: () => void): string {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
    lines.push(typeof msg === "string" ? msg : String(msg));
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return lines.join("\n");
}

describe("showHelp", () => {
  it("Usage 行と Commands セクションを表示する", () => {
    const out = captureLog(showHelp);
    expect(out).toContain("Usage: bitbank <command> [options]");
    expect(out).toContain("Commands:");
  });

  it("代表的な public コマンドを列挙する", () => {
    const out = captureLog(showHelp);
    expect(out).toContain("ticker");
    expect(out).toContain("depth");
    expect(out).toContain("candles");
  });

  it("special command（schema/profiles）と trade セクションを案内する", () => {
    const out = captureLog(showHelp);
    expect(out).toContain("schema");
    expect(out).toContain("profiles");
    expect(out).toContain("trade <subcommand>");
  });

  it("グローバルフラグ（--profile / --format / --machine / --help）を案内する", () => {
    const out = captureLog(showHelp);
    expect(out).toContain("--profile");
    expect(out).toContain("--format");
    expect(out).toContain("--machine");
    expect(out).toContain("--help");
  });
});

describe("showTradeHelp", () => {
  it("trade 用の Usage 行と dry-run 注意書きを表示する", () => {
    const out = captureLog(showTradeHelp);
    expect(out).toContain("Usage: bitbank trade <subcommand> [options]");
    expect(out).toContain("dry-run");
    expect(out).toContain("--execute");
  });

  it("Subcommands セクションに代表的な trade コマンドを列挙する", () => {
    const out = captureLog(showTradeHelp);
    expect(out).toContain("Subcommands:");
    expect(out).toContain("create-order");
    expect(out).toContain("cancel-order");
  });

  it("サブコマンドヘルプの呼び出し方を案内する", () => {
    const out = captureLog(showTradeHelp);
    expect(out).toContain("bitbank trade <subcommand> --help");
  });
});
