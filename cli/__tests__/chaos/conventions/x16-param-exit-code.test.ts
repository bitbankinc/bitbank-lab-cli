import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// コマンドの「入力検証エラー」return は exit code 体系（cli/exit-codes.ts）の
// EXIT.PARAM を必ず持つ。付けないと output.ts の `result.exitCode ?? 1` で
// GENERAL(1) に落ち、bot / AI エージェントが内部エラーと誤認して
// 不要なリトライ・エスカレーションをする（QA 診断: trade 入力検証が exit 1）。
//
// 参考実装: cli/commands/private/active-orders.ts
//   return { success: false, error: formatZodError(parsed.error), exitCode: EXIT.PARAM };

function commandFiles(): string[] {
  return execSync('find cli/commands -name "*.ts" -not -path "*/__tests__/*"', {
    encoding: "utf-8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
}

/** guard 行から brace バランスでブロック本文を取り出す（単一行 guard も可）。 */
function blockTextFrom(lines: string[], start: number): string {
  let depth = 0;
  let opened = false;
  const buf: string[] = [];
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "{") {
        depth++;
        opened = true;
      } else if (ch === "}") {
        depth--;
      }
    }
    buf.push(lines[i]);
    if (opened && depth <= 0) break;
  }
  return buf.join("\n");
}

/** 入力 safeParse の失敗 guard で exitCode を返していない箇所を列挙する。
 *  response 検証（safeParse(result.data)）は PARAM ではないため除外する。 */
function inputSafeParseViolations(file: string): string[] {
  const lines = readFileSync(file, "utf-8").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/\b(?:const|let)\s+(\w+)\s*=\s*[\w.]+\.safeParse\(/);
    if (!m) continue;
    // API レスポンスの schema parse（result.data 等）は入力検証ではない。
    if (/\bresult\b/.test(lines[i])) continue;
    const v = m[1];
    const guardRe = new RegExp(`if\\s*\\(\\s*!\\s*${v}\\.success\\s*\\)`);
    const guardIdx = lines.findIndex((l, idx) => idx > i && guardRe.test(l));
    if (guardIdx === -1) continue;
    if (!/exitCode/.test(blockTextFrom(lines, guardIdx))) {
      out.push(`${file}:${guardIdx + 1} (${v} = …safeParse @${i + 1})`);
    }
  }
  return out;
}

/** 必須フィールド欠落 return（error: MSG_*）で exitCode を欠く箇所を列挙する。
 *  MSG_* 定数は「X is required…」という入力エラー専用なので必ず PARAM。
 *  `required_error: MSG_*`（schema 定義）は \b で除外される。 */
function msgConstViolations(file: string): string[] {
  const lines = readFileSync(file, "utf-8").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/\berror:\s*MSG_/.test(lines[i])) continue;
    const window = lines.slice(i, i + 2).join("\n"); // 同一行 or 直後の exitCode 行
    if (!/exitCode/.test(window)) out.push(`${file}:${i + 1}`);
  }
  return out;
}

describe("Chaos X-16: input-validation returns carry EXIT.PARAM (no default-1 fall-through)", () => {
  it("every input safeParse failure return includes exitCode", () => {
    const files = commandFiles();
    expect(files.length, "expected to discover command files").toBeGreaterThan(0);
    const violations = files.flatMap(inputSafeParseViolations);
    expect(
      violations,
      `Input schema-parse failures must return exitCode (EXIT.PARAM) so bots don't read them as GENERAL(1). See cli/exit-codes.ts / output.ts:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("every required-field (MSG_*) failure return includes exitCode", () => {
    const files = commandFiles();
    const violations = files.flatMap(msgConstViolations);
    expect(
      violations,
      `Missing-required-field returns (error: MSG_*) must include exitCode (EXIT.PARAM):\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
