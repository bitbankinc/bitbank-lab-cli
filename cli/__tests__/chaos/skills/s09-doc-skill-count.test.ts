import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../../..");
const SKILLS_DIR = resolve(ROOT, "skills");

/**
 * 実在する Skill のディレクトリ名。`_`始まり（`_shared` / テスト用の
 * `_chaos-test-skill` 等）は Skill ではないので除外する。
 */
function realSkillDirs(): string[] {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name)
    .filter((name) => existsSync(resolve(SKILLS_DIR, name, "SKILL.md")));
}

// 現在の Skill 構成を説明する「ライブ」ドキュメントのみ対象にする。
// CHANGELOG.md / docs/dev/phases.md はリリース・フェーズ時点のスナップショット
// （= 凍結された記録）なので、現在数と一致させる対象には含めない。
const DOCS = ["README.md", "docs/skill-workflow.md"];

// Skill の「総数」を述べているプローズだけを拾うパターン。数字が "Skill" に
// 隣接しているものに限定するので、`分析系（7本）` のようなカテゴリ別小計
//（数字の隣がカテゴリ名で "Skill" ではない）は意図的にマッチしない。
const TOTAL_COUNT_RES: RegExp[] = [
  // 数字が先: "7 つの Skill" / "全 12 の Skill" / "12 個の Skill"
  /(\d+)\s*(?:つの?|個の?|本の?|の)\s*Skill\b/g,
  // Skill が先: "Skill を 12 本" / "Agent Skills（12本"
  /Skills?\s*[（(]?\s*を?\s*(\d+)\s*(?:本|個|つ)/g,
];

function totalCountClaims(content: string): number[] {
  const found: number[] = [];
  for (const re of TOTAL_COUNT_RES) {
    for (const m of content.matchAll(re)) found.push(Number(m[1]));
  }
  return found;
}

describe("Chaos S-09: doc skill-count prose matches real SKILL.md count", () => {
  const actual = realSkillDirs().length;

  // 構成変更時にここが落ちたら、SKILL.md を増減した数と文章がズレている。
  // 新たに総数を述べる文を足すときは TOTAL_COUNT_RES に拾える形で書くこと。
  for (const rel of DOCS) {
    it(`${rel}: every total-skill-count claim equals ${actual}`, () => {
      const content = readFileSync(resolve(ROOT, rel), "utf-8");
      const claims = totalCountClaims(content);
      expect(claims.length, `no skill-count prose found in ${rel}`).toBeGreaterThan(0);
      for (const n of claims) {
        expect(n, `stale skill count in ${rel}: found ${n}, expected ${actual}`).toBe(actual);
      }
    });
  }
});

describe("Chaos S-09: skills/INDEX.md catalog stays complete", () => {
  it("links exactly the set of real Skills (canonical catalog)", () => {
    const content = readFileSync(resolve(SKILLS_DIR, "INDEX.md"), "utf-8");
    const linked = new Set([...content.matchAll(/\]\(([\w-]+)\/SKILL\.md\)/g)].map((m) => m[1]));
    expect(linked).toEqual(new Set(realSkillDirs()));
  });
});
