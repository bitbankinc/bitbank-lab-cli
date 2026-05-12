import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/** Match imports of any HTTP module or auth.
 * Order matters: list longer module names first so the regex engine prefers
 * `http-private-post` over `http-private` over `http`, and so `\bauth`
 * anchors on a word boundary (avoiding matches like "oauth").
 * Type-only imports (`import type ...`) are erased at compile time and
 * cannot make API calls — we exclude them so e.g. profiles-resolver can
 * still re-export the ApiCredentials shape that http-private consumes.
 */
const FORBIDDEN_RE =
  "from ['\\\"][^'\\\"]*/(http-private-post|http-private|http|\\bauth)(\\.js)?['\\\"]";

function grepForbidden(paths: string[]): string[] {
  const joined = paths.join(" ");
  const out = execSync(
    `grep -rEn ${JSON.stringify(FORBIDDEN_RE)} ${joined} --include="*.ts" | grep -vE "^[^:]*:[0-9]+:import type " || true`,
    { encoding: "utf-8" },
  ).trim();
  return out ? out.split("\n") : [];
}

describe("Chaos X-11: profile commands do not hit any HTTP API", () => {
  it("cli/commands/profile/ does not import cli/http* or cli/auth", () => {
    const hits = grepForbidden(["cli/commands/profile/"]);
    expect(
      hits,
      `profile commands must not call bitbank API (see .claude/rules/commands.md: "profile は実 API を叩かない"):\n${hits.join("\n")}`,
    ).toEqual([]);
  });

  it("cli/profiles-*.ts does not import cli/http* or cli/auth", () => {
    const helpers = execSync('find cli/ -maxdepth 1 -name "profiles-*.ts"', { encoding: "utf-8" })
      .trim()
      .split("\n")
      .filter(Boolean);
    expect(helpers.length, "expected to discover cli/profiles-*.ts helpers").toBeGreaterThan(0);
    const hits = grepForbidden(helpers);
    expect(
      hits,
      `profile helpers must not call bitbank API (see .claude/rules/commands.md: "profile は実 API を叩かない"):\n${hits.join("\n")}`,
    ).toEqual([]);
  });
});
