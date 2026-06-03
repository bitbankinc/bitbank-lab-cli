// 人間向けの table / csv 整形。Result envelope の serialization（output.ts）とは
// 責務が異なるため分離。どちらも data 本体だけを受け取り、meta には触れない。
import { escapeControlChars, escapeControlCharsForCsv } from "./sanitize-control.js";

function toRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (typeof data === "object" && data !== null) return [data as Record<string, unknown>];
  return [{ value: data }];
}

// ネストした値（配列・オブジェクト）はセルでは [object Object] になり情報が落ちる。
// margin-status の available_balances や margin-positions の notice/losscut_threshold
// 等を欠損なく見せるため、非スカラーは compact JSON でセル化する。
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function printTable(data: unknown): void {
  const rows = toRows(data);
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]);

  // 列幅を1パスで計算（制御文字エスケープ後の表示長で揃える）
  const widths = keys.map((k) => k.length);
  const cells: string[][] = [];
  for (const row of rows) {
    const rowCells: string[] = [];
    for (let i = 0; i < keys.length; i++) {
      const s = escapeControlChars(cell(row[keys[i]]));
      if (s.length > widths[i]) widths[i] = s.length;
      rowCells.push(s);
    }
    cells.push(rowCells);
  }

  const parts: string[] = [];
  parts.push(keys.map((k, i) => k.padEnd(widths[i])).join("  "));
  parts.push(widths.map((w) => "-".repeat(w)).join("  "));
  for (const rowCells of cells) {
    parts.push(rowCells.map((s, i) => s.padEnd(widths[i])).join("  "));
  }
  process.stdout.write(`${parts.join("\n")}\n`);
}

// OWASP CSV Injection: 先頭が = + - @ \t \r なら式評価される恐れがあるため強制クォート
const NEEDS_QUOTE_RE = /^[=+\-@\t\r]|[,"\n]/;

function escapeCsvField(value: string): string {
  if (NEEDS_QUOTE_RE.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function printCsv(data: unknown): void {
  const rows = toRows(data);
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  const parts: string[] = [keys.map(escapeCsvField).join(",")];
  for (const row of rows) {
    // 制御文字エスケープ → CSV クォート判定の順（TAB/CR/LF は CSV 防御に温存）
    parts.push(keys.map((k) => escapeCsvField(escapeControlCharsForCsv(cell(row[k])))).join(","));
  }
  process.stdout.write(`${parts.join("\n")}\n`);
}
