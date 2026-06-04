import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// margin バグ（PR #280 / #281）の根本原因は、テストのモックが実装と同じ架空
// フィールドで自己完結し、実 API 形状を一切検証していなかったこと。同じ穴を
// 再び踏まないため、private テストは実 API docs 由来の共有フィクスチャ
// （cli/__tests__/__fixtures__/private/）を参照し、即席インラインモックを
// 組まないことを軽量に検査する。
//
// 当初は margin 2 本のベタ書きリストだったが、本監査
// （docs/dev/audit-private-trade-schema-divergence.md）で展開対象が確定したため、
// 「実 API 形状が確定した private エンドポイントはフィクスチャ駆動で自動検査」へ
// 一般化した。__fixtures__/private/<endpoint>.ts を置けば、対応する
// __tests__/private/<endpoint>.test.ts がそのフィクスチャを import しているかを
// 自動で強制する（明示リストの編集は不要）。
//
// 注意: 「モックが実 API と一致」を完全に機械検証するのは原理的に困難
// （ライブ呼び出しなしでは実形状を取れない）。本テストはあくまで
// 「即席インラインモックの混入検知」に留め、実形状の正しさはフィクスチャ集約と
// レビュー観点の明文化（docs/dev/conventions.md）で担保する。

// フィクスチャ列挙時に除外する補助ファイル（集約用 index 等）。
const AUX_FILES = new Set(["index.ts"]);

const FIXTURES_DIR = join(process.cwd(), "cli", "__tests__", "__fixtures__", "private");
const TESTS_DIR = join(process.cwd(), "cli", "__tests__", "private");

// フィクスチャ <name>.ts ↔ テスト <name>.test.ts の basename 一致を検査する。
// (fixtureDir, testDir) を引数に取るので、将来 trade 系へ展開する際は
// このペアを 1 つ追加するだけで同じ検査経路に乗せられる。
function listFixtureNames(fixtureDir: string): string[] {
  return readdirSync(fixtureDir)
    .filter((f) => f.endsWith(".ts") && !AUX_FILES.has(f))
    .map((f) => f.replace(/\.ts$/, ""));
}

describe("Chaos X-18: private tests use shared __fixtures__ (no inline ad-hoc mocks)", () => {
  const fixtures = listFixtureNames(FIXTURES_DIR);

  it("has at least one private fixture to enforce", () => {
    // 退行検知: 列挙ロジックが壊れて 0 件になると検査が空振りするため明示する。
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const name of fixtures) {
    const testFile = `${name}.test.ts`;
    const testPath = join(TESTS_DIR, testFile);

    it(`${testFile} exists for fixture ${name}.ts`, () => {
      expect(
        existsSync(testPath),
        `Fixture cli/__tests__/__fixtures__/private/${name}.ts has no matching test cli/__tests__/private/${testFile} (basename must match; see docs/dev/conventions.md).`,
      ).toBe(true);
    });

    it(`${testFile} imports its mock shape from __fixtures__/private/${name}`, () => {
      if (!existsSync(testPath)) return; // 上の it が落ちるので二重報告しない
      const src = readFileSync(testPath, "utf-8");
      const importRe = new RegExp(`from\\s+["'][^"']*__fixtures__/private/${name}(?:\\.js)?["']`);
      expect(
        importRe.test(src),
        `${testFile} must import its mock from cli/__tests__/__fixtures__/private/${name} instead of defining an inline ad-hoc mock (see docs/dev/conventions.md).`,
      ).toBe(true);
    });
  }
});
