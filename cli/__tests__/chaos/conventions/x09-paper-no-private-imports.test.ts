import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/** Match imports of forbidden modules.
 * Order matters: list `http-private-post` before `http-private` so the
 * longer alternative wins (otherwise `.../http-private-post.js` is captured
 * as `http-private`). `\bauth` anchors on a word boundary so unrelated names
 * like "oauth" or "authority" do not match.
 * Type-only imports (`import type ...`) are erased at compile time and
 * cannot make API calls, so they're excluded.
 */
const FORBIDDEN_RE =
  "from ['\\\"][^'\\\"]*/(http-private-post|http-private|\\bauth)(\\.js)?['\\\"]";

function grepForbidden(paths: string[]): string[] {
  const joined = paths.join(" ");
  const out = execSync(
    `grep -rEn ${JSON.stringify(FORBIDDEN_RE)} ${joined} --include="*.ts" | grep -vE "^[^:]*:[0-9]+:import type " || true`,
    { encoding: "utf-8" },
  ).trim();
  return out ? out.split("\n") : [];
}

describe("Chaos X-09: paper uses only public ticker / candles (no private/trade API)", () => {
  it("cli/commands/paper/ does not import http-private / http-private-post / auth", () => {
    const hits = grepForbidden(["cli/commands/paper/"]);
    expect(
      hits,
      `paper commands must not touch private API (see CLAUDE.md "paper" 例外節 / .claude/rules/commands.md):\n${hits.join("\n")}`,
    ).toEqual([]);
  });

  it("cli/paper-*.ts does not import http-private / http-private-post / auth", () => {
    const helpers = execSync('find cli/ -maxdepth 1 -name "paper-*.ts"', { encoding: "utf-8" })
      .trim()
      .split("\n")
      .filter(Boolean);
    expect(helpers.length, "expected to discover cli/paper-*.ts helpers").toBeGreaterThan(0);
    const hits = grepForbidden(helpers);
    expect(
      hits,
      `paper helpers must not touch private API (see CLAUDE.md "paper" 例外節):\n${hits.join("\n")}`,
    ).toEqual([]);
  });
});
