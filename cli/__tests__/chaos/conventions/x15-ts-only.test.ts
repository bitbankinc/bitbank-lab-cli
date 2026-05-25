import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// 本プロジェクトはビルドステップなし・tsx 直接実行の薄い CLI アクセス層。
// .tsx / .jsx (React 系) や .js / .mjs / .cjs (生成物 / 別言語) の混入を
// 構造的に禁止する。手書きの .d.ts も同様（型は zod の z.infer に統一）。
// この規約により他 chaos test の grep が --include='*.ts' のみで足りる。
const FORBIDDEN_EXTENSIONS = ["tsx", "jsx", "js", "mjs", "cjs", "d.ts"];

describe("Chaos X-15: cli/ contains only .ts source files", () => {
  it("no .tsx / .jsx / .js / .mjs / .cjs / .d.ts under cli/", () => {
    const nameExprs = FORBIDDEN_EXTENSIONS.map((e) => `-name '*.${e}'`).join(" -o ");
    const cmd = `find cli -type f \\( ${nameExprs} \\) || true`;
    const found = execSync(cmd, { encoding: "utf-8" }).trim();
    if (found !== "") {
      expect.fail(
        `cli/ must contain only .ts source files. Forbidden files found:\n${found}\nSee CLAUDE.md: 「ビルドステップなし、tsx で直接実行」。`,
      );
    }
  });
});
