import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMANDS } from "../../../commands/registry.js";

const SKILLS_DIR = resolve(import.meta.dirname, "../../../../.claude/skills");
const SKILLS = ["indicator-analysis", "backtest", "portfolio"];

/** Extract CLI subcommands from SKILL.md command examples */
function extractCommands(content: string): string[] {
  const re = /^\s*bitbank\s+([a-z][\w-]*)/gm;
  const cmds: string[] = [];
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: regex loop
  while ((m = re.exec(content)) !== null) {
    cmds.push(m[1]);
  }
  return [...new Set(cmds)];
}

describe("Chaos S-05: Skill CLI command examples match real commands", () => {
  const knownCommands = new Set([...Object.keys(COMMANDS), "schema", "profiles"]);

  for (const skill of SKILLS) {
    it(`${skill}: all referenced commands exist in CLI`, () => {
      const content = readFileSync(resolve(SKILLS_DIR, skill, "SKILL.md"), "utf-8");
      const cmds = extractCommands(content);
      expect(cmds.length).toBeGreaterThan(0);
      for (const cmd of cmds) {
        expect(knownCommands.has(cmd), `Unknown command "${cmd}" in ${skill}/SKILL.md`).toBe(true);
      }
    });
  }

  it("references/ files also use valid commands", () => {
    for (const skill of SKILLS) {
      const refsDir = resolve(SKILLS_DIR, skill, "references");
      const files = readdirSync(refsDir).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        const content = readFileSync(resolve(refsDir, file), "utf-8");
        const cmds = extractCommands(content);
        for (const cmd of cmds) {
          expect(
            knownCommands.has(cmd),
            `Unknown command "${cmd}" in ${skill}/references/${file}`,
          ).toBe(true);
        }
      }
    }
  });
});
