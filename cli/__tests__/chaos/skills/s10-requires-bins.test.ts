import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../../..");
const SKILLS_DIR = resolve(ROOT, "skills");

// plugin install は CLI 本体（node_modules）を配布しない。エージェントが
// 未インストール環境で正しく案内できるよう、全 skill が frontmatter で
// バイナリ依存を機械可読に宣言していることを検査する（.claude/rules/skills.md）。
function realSkillDirs(): string[] {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name)
    .filter((name) => existsSync(resolve(SKILLS_DIR, name, "SKILL.md")));
}

function frontmatter(skill: string): string {
  const content = readFileSync(resolve(SKILLS_DIR, skill, "SKILL.md"), "utf-8");
  const end = content.indexOf("\n---\n", 4);
  expect(content.startsWith("---\n"), `${skill}: frontmatter missing`).toBe(true);
  expect(end, `${skill}: frontmatter not closed`).toBeGreaterThan(0);
  return content.slice(4, end);
}

describe("Chaos S-10: every skill declares metadata.requires.bins: [bitbank]", () => {
  for (const skill of realSkillDirs()) {
    it(`${skill}: requires.bins includes bitbank`, () => {
      const fm = frontmatter(skill);
      expect(fm, `${skill}: add "requires:\\n    bins:\\n      - bitbank" to metadata`).toMatch(
        /requires:\n(?:.*\n)*?\s+bins:\n\s+- bitbank\b/,
      );
    });

    it(`${skill}: compatibility states the CLI is installed separately`, () => {
      const fm = frontmatter(skill);
      expect(fm, `${skill}: compatibility must mention "npm i -g bitbank-lab-cli"`).toContain(
        "npm i -g bitbank-lab-cli",
      );
    });
  }
});
