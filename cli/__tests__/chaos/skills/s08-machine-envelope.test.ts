import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SKILLS_DIR = resolve(import.meta.dirname, "../../../../.claude/skills");

const EXEMPT_PATTERNS = [
  /\bwatch\s+\w+/, // bitbank watch ticker <pair>
  /\bstream\b/, // bitbank stream <pair>
  /\bcompletion\b/, // bitbank completion <shell>
  /\bprofile\s+add\b/, // インタラクティブ（hidden secret 入力）
];

type CommandLine = { file: string; startLine: number; text: string };

function findMdFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...findMdFiles(p));
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(p);
  }
  return out;
}

/** Join shell continuations (`\` at line end) so multi-line `bitbank ...` commands are one entry. */
function joinContinuations(content: string): { startLine: number; text: string }[] {
  const lines = content.split("\n");
  const out: { startLine: number; text: string }[] = [];
  let buf = "";
  let startLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, "");
    if (buf === "") startLine = i + 1;
    if (line.endsWith("\\")) {
      buf += `${line.slice(0, -1)} `;
    } else {
      buf += line;
      out.push({ startLine, text: buf });
      buf = "";
    }
  }
  if (buf !== "") out.push({ startLine, text: buf });
  return out;
}

function findViolations(file: string): CommandLine[] {
  const content = readFileSync(file, "utf-8");
  const joined = joinContinuations(content);
  const out: CommandLine[] = [];
  for (const { startLine, text } of joined) {
    if (!/\bbitbank\b/.test(text)) continue;
    if (!text.includes("--format=json")) continue;
    if (EXEMPT_PATTERNS.some((re) => re.test(text))) continue;
    if (text.includes("--machine")) continue;
    out.push({ file: relative(SKILLS_DIR, file), startLine, text: text.trim() });
  }
  return out;
}

describe("Chaos S-08: one-shot bitbank --format=json examples include --machine", () => {
  it("every skill / shared reference command example is compliant", () => {
    const files = findMdFiles(SKILLS_DIR);
    expect(files.length).toBeGreaterThan(0);
    const violations: CommandLine[] = [];
    for (const file of files) violations.push(...findViolations(file));
    expect(
      violations,
      `Missing --machine on ${violations.length} command example(s):\n${JSON.stringify(violations, null, 2)}`,
    ).toEqual([]);
  });
});
