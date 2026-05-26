import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function grepConfirm(file: string): string {
  return execSync(`grep -E "\\.confirm\\b" ${file} || true`, { encoding: "utf-8" }).trim();
}

describe("Chaos X-10: destructive non-trade commands enforce --confirm", () => {
  it("cli/commands/paper/reset.ts references .confirm", () => {
    const hit = grepConfirm("cli/commands/paper/reset.ts");
    expect(
      hit,
      'paper reset must require --confirm (see .claude/rules/commands.md: "paper の reset のみ --confirm を必須")',
    ).not.toBe("");
  });

  it("cli/commands/profile/remove.ts references .confirm", () => {
    const hit = grepConfirm("cli/commands/profile/remove.ts");
    expect(
      hit,
      'profile remove must require --confirm (see .claude/rules/commands.md: "profile の remove のみ --confirm を必須")',
    ).not.toBe("");
  });
});

/** Trade commands gate POST on --execute + a fixed --confirm=<phrase> phrase.
 *  Validation lives in Zod schemas via refineExecuteConfirm() from
 *  cli/commands/trade/confirm-guard.ts (single source of truth for phrases). */
const TRADE_EXCLUDED = new Set(["dry-run.ts", "confirm-guard.ts", "index.ts"]);

function tradeCommandFiles(): string[] {
  const out = execSync('find cli/commands/trade -maxdepth 1 -name "*.ts"', {
    encoding: "utf-8",
  }).trim();
  return out
    .split("\n")
    .filter(Boolean)
    .filter((f) => !TRADE_EXCLUDED.has(f.split("/").pop() ?? ""));
}

describe("Chaos X-10b: trade commands enforce --execute + --confirm via Zod", () => {
  it("every trade command references refineExecuteConfirm (the shared guard)", () => {
    const files = tradeCommandFiles();
    expect(files.length, "expected to discover trade command files").toBeGreaterThan(0);
    const missing = files.filter((f) => {
      const hit = execSync(`grep -E "refineExecuteConfirm" ${f} || true`, {
        encoding: "utf-8",
      }).trim();
      return hit === "";
    });
    expect(
      missing,
      `Trade commands missing refineExecuteConfirm (see .claude/rules/trading-safety.md "--confirm フラグ"):\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("CONFIRM_PHRASES covers exactly the 5 trade commands", async () => {
    const mod = await import("../../../commands/trade/confirm-guard.js");
    expect(Object.keys(mod.CONFIRM_PHRASES).sort()).toEqual([
      "cancel-order",
      "cancel-orders",
      "confirm-deposits",
      "confirm-deposits-all",
      "create-order",
    ]);
  });
});
