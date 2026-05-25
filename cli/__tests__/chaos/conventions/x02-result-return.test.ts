import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/** Helpers that don't return Result (display-only, types, etc.) */
const EXCLUDED = new Set(["dry-run.ts", "candles-merge.ts"]);

/** Find .ts files missing Promise<Result< in a directory */
function findMissing(dir: string): string[] {
  const missing = execSync(`grep -rL "Promise<Result<" ${dir} --include="*.ts" || true`, {
    encoding: "utf-8",
  }).trim();
  return missing
    ? missing.split("\n").filter((f) => {
        const name = f.split("/").pop() ?? "";
        return Boolean(f) && !EXCLUDED.has(name);
      })
    : [];
}

describe("Chaos X-02: all commands return Result<T>", () => {
  it("all public command files use Promise<Result<", () => {
    const missing = findMissing("cli/commands/public/");
    expect(missing, `Missing Promise<Result<: ${missing.join(", ")}`).toEqual([]);
  });

  it("all private command files use Promise<Result<", () => {
    const missing = findMissing("cli/commands/private/");
    expect(missing, `Missing Promise<Result<: ${missing.join(", ")}`).toEqual([]);
  });

  it("all trade command files use Promise<Result<", () => {
    const missing = findMissing("cli/commands/trade/");
    expect(missing, `Missing Promise<Result<: ${missing.join(", ")}`).toEqual([]);
  });

  it("all 4 http modules return Result<T>", () => {
    const hits = execSync(
      'grep -l "Promise<Result<" cli/http.ts cli/http-private.ts cli/http-private-post.ts cli/http-core.ts || true',
      { encoding: "utf-8" },
    ).trim();
    expect(hits.split("\n").filter(Boolean)).toHaveLength(4);
  });
});
