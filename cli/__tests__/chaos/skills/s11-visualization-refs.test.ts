import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../../..");
const SKILLS_DIR = resolve(ROOT, "skills");
const GUIDE_REL = "_shared/references/visualization-guide.md";

// 可視化節（## 可視化）を必ず持つ skill。可視化対応 skill を増やすのは自由
// （節を持つ skill は下の検査対象に自動で入る）。ここから外すのは可視化
// レイヤーの設計変更なので、visualization-guide.md と合わせて見直すこと。
const REQUIRED_VIZ_SKILLS = [
  "backtest",
  "signal-explorer",
  "correlation-analysis",
  "volatility-profile",
  "portfolio",
];

function realSkillDirs(): string[] {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name)
    .filter((name) => existsSync(resolve(SKILLS_DIR, name, "SKILL.md")));
}

function skillMd(skill: string): string {
  return readFileSync(resolve(SKILLS_DIR, skill, "SKILL.md"), "utf-8");
}

/** 「## 可視化」見出しから次の H2 見出しまでを切り出す（なければ null） */
function vizSection(content: string): string | null {
  const m = content.match(/^## 可視化[^\n]*$/m);
  if (m?.index === undefined) return null;
  const rest = content.slice(m.index + m[0].length);
  const next = rest.search(/\n## /);
  return next === -1 ? rest : rest.slice(0, next);
}

describe("Chaos S-11: shared visualization guide exists", () => {
  it(`skills/${GUIDE_REL} exists`, () => {
    expect(existsSync(resolve(SKILLS_DIR, GUIDE_REL))).toBe(true);
  });
});

describe("Chaos S-11: required skills keep their 可視化 section", () => {
  for (const skill of REQUIRED_VIZ_SKILLS) {
    it(`${skill}: has a "## 可視化" section`, () => {
      expect(vizSection(skillMd(skill)), `${skill}: missing "## 可視化" section`).not.toBeNull();
    });
  }
});

describe("Chaos S-11: every 可視化 section follows the shared conventions", () => {
  const withViz = realSkillDirs().filter((s) => vizSection(skillMd(s)) !== null);
  const allChartIds: string[] = [];

  it("at least the required skills have sections", () => {
    expect(new Set(withViz).size).toBeGreaterThanOrEqual(REQUIRED_VIZ_SKILLS.length);
  });

  for (const skill of withViz) {
    it(`${skill}: 可視化 section references ${GUIDE_REL}`, () => {
      const section = vizSection(skillMd(skill)) ?? "";
      expect(section, `${skill}: 可視化 section must reference ${GUIDE_REL}`).toContain(GUIDE_REL);
    });

    it(`${skill}: chart IDs are prefixed with the skill name`, () => {
      const section = vizSection(skillMd(skill)) ?? "";
      const ownIds: string[] = [];
      // チャート ID の「定義」= 標準チャート表の先頭列（`| \`<id>\` | ...`）。
      // 本文プローズ中の他 skill チャートへの誘導（クロスリファレンス）は
      // 定義ではないので走査しない
      for (const m of section.matchAll(/^\|\s*`([a-z][a-z0-9-]*)\.([a-z][a-z0-9-]*)`\s*\|/gm)) {
        const [, prefix, slug] = m;
        expect(prefix, `${skill}: chart ID \`${prefix}.${slug}\` has a foreign prefix`).toBe(skill);
        ownIds.push(`${prefix}.${slug}`);
      }
      expect(
        ownIds.length,
        `${skill}: 可視化 section must define at least one chart ID in its table`,
      ).toBeGreaterThan(0);
      allChartIds.push(...ownIds);
    });
  }

  it("chart IDs are globally unique", () => {
    const dupes = allChartIds.filter((id, i) => allChartIds.indexOf(id) !== i);
    expect(dupes, `duplicate chart IDs: ${dupes.join(", ")}`).toEqual([]);
  });
});
