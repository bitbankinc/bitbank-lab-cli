import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SKILLS_DIR = resolve(import.meta.dirname, "../../../../.claude/skills");
const SKILLS = ["indicator-analysis", "backtest", "portfolio"];

/** Known CLI flags from cli/index.ts parseArgs + Node.js flags used in skills */
const KNOWN_FLAGS = new Set([
  "--profile",
  "--format",
  "--machine",
  "--help",
  "--type",
  "--date",
  "--limit",
  "--pair",
  "--order-id",
  "--order-ids",
  "--count",
  "--since",
  "--end",
  "--order",
  "--asset",
  "--all",
  "--side",
  "--price",
  "--amount",
  "--trigger-price",
  "--post-only",
  "--execute",
  "--confirm",
  "--uuid",
  "--token",
  "--id",
  "--private",
  "--channel",
  "--filter",
  "--from",
  "--to",
  "--raw",
  "--no-cache",
  "--log-file",
  // Node.js flags referenced in skill docs
  "--env-file",
]);

/** Extract --flag patterns from CLI command lines only */
function extractFlags(content: string): string[] {
  const flags: string[] = [];
  for (const line of content.split("\n")) {
    // Only process lines that look like CLI invocations
    if (!line.includes("npx") && !line.includes("--")) continue;
    if (line.startsWith("---")) continue;
    const re = /--[\w][\w-]*/g;
    let m: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: regex loop
    while ((m = re.exec(line)) !== null) {
      flags.push(m[0]);
    }
  }
  return [...new Set(flags)];
}

describe("Chaos S-06: Skill references only known CLI flags", () => {
  for (const skill of SKILLS) {
    it(`${skill}/SKILL.md uses only known flags`, () => {
      const content = readFileSync(resolve(SKILLS_DIR, skill, "SKILL.md"), "utf-8");
      const flags = extractFlags(content);
      for (const flag of flags) {
        expect(KNOWN_FLAGS.has(flag), `Unknown flag "${flag}" in ${skill}/SKILL.md`).toBe(true);
      }
    });
  }
});
