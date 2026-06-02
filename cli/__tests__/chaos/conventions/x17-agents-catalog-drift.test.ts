import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildErrorCatalog,
  buildToolCatalog,
  serialize,
} from "../../../../scripts/gen-agents-catalog.js";

// agents/*.json は手書き禁止 — scripts/gen-agents-catalog.ts が単一ソース
// (cli/commands/schema・confirm-guard・cli/error-codes・cli/exit-codes) から生成する。
// committed と regenerate の差分ゼロを検査し、コマンド追加・エラーコード変更時の
// 取り込み漏れ（"7 vs 12" 級のズレ）を CI で止める。
const AGENTS = join(process.cwd(), "agents");

function committed(file: string): string {
  return readFileSync(join(AGENTS, file), "utf-8");
}

describe("Chaos X-17: agents/ catalogs are generated, not hand-edited (anti-drift)", () => {
  it("agents/tool-catalog.json matches the generator output", () => {
    expect(
      serialize(buildToolCatalog()),
      "agents/tool-catalog.json is stale. Run `npx tsx scripts/gen-agents-catalog.ts` and commit.",
    ).toBe(committed("tool-catalog.json"));
  });

  it("agents/error-catalog.json matches the generator output", () => {
    expect(
      serialize(buildErrorCatalog()),
      "agents/error-catalog.json is stale. Run `npx tsx scripts/gen-agents-catalog.ts` and commit.",
    ).toBe(committed("error-catalog.json"));
  });
});
