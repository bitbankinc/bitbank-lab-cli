import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** publicGet は public.bitbank.cc（market data 系: /<pair>/ticker, /tickers 等）、
 * apiPublicGet は api.bitbank.cc（/v1/spot/* 系）に prefix する（cli/http.ts）。
 * 取り違えるとコンパイルは通るが実行時に HTTP 404 になる
 * （前科: status.ts が publicGet で /v1/spot/status を叩いて 404）。
 * 呼び出し側の path 先頭リテラルで host 選択を静的に検査する。
 */

const CALL_RE = /\b(apiPublicGet|publicGet)\s*(?:<[^>]*>)?\(\s*[`"']([^`"']*)/g;

function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts"))
    .map((e) => join(e.parentPath, e.name));
}

function collectViolations(): string[] {
  const violations: string[] = [];
  for (const file of tsFilesUnder("cli/commands")) {
    const src = readFileSync(file, "utf-8");
    for (const m of src.matchAll(CALL_RE)) {
      const [, fn, path] = m;
      const line = src.slice(0, m.index).split("\n").length;
      if (fn === "publicGet" && path.startsWith("/v1/")) {
        violations.push(`${file}:${line}: publicGet("${path}...") — /v1/ 系は apiPublicGet を使う`);
      }
      if (fn === "apiPublicGet" && !path.startsWith("/v1/")) {
        violations.push(
          `${file}:${line}: apiPublicGet("${path}...") — market data 系は publicGet を使う`,
        );
      }
      if (path.startsWith("${")) {
        violations.push(
          `${file}:${line}: ${fn}(\`${path}...\`) — path 先頭が変数展開だと host 選択を静的検査できない。先頭は文字列リテラルにする`,
        );
      }
    }
  }
  return violations;
}

describe("Chaos X-19: publicGet / apiPublicGet の host-path 対応", () => {
  it("publicGet に /v1/ path を渡さない・apiPublicGet は /v1/ path のみ", () => {
    const violations = collectViolations();
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("検査対象に publicGet / apiPublicGet の呼び出しがそれぞれ存在する（自壊検知）", () => {
    const counts = { publicGet: 0, apiPublicGet: 0 };
    for (const file of tsFilesUnder("cli/commands")) {
      for (const m of readFileSync(file, "utf-8").matchAll(CALL_RE)) {
        counts[m[1] as keyof typeof counts]++;
      }
    }
    expect(counts.publicGet).toBeGreaterThan(0);
    expect(counts.apiPublicGet).toBeGreaterThan(0);
  });
});
