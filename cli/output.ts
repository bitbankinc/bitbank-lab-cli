import type { Format, Result } from "./types.js";

export function output<T>(result: Result<T>, format: Format, raw = false, machine = false): void {
  if (machine) {
    machineOutput(result);
    return;
  }
  if (!result.success) {
    process.stderr.write(`Error: ${result.error}\n`);
    process.exitCode = result.exitCode ?? 1;
    return;
  }
  if (result.meta?.truncated) {
    process.stderr.write(`Warning: truncated data returned (${result.meta.reason ?? "unknown"})\n`);
  } else if (result.partial) {
    process.stderr.write("Warning: partial data returned (some fetches failed)\n");
  }
  const data = result.data;
  switch (format) {
    case "json":
      process.stdout.write(
        `${JSON.stringify(data, raw ? undefined : null, raw ? undefined : 2)}\n`,
      );
      break;
    case "table":
      printTable(data);
      break;
    case "csv":
      printCsv(data);
      break;
  }
}

export function machineOutput<T>(result: Result<T>): void {
  if (result.success) {
    const envelope: Record<string, unknown> = { success: true, data: result.data };
    if (result.partial) envelope.partial = true;
    if (result.meta) envelope.meta = result.meta;
    process.stdout.write(`${JSON.stringify(envelope)}\n`);
  } else {
    const exitCode = result.exitCode ?? 1;
    process.stdout.write(`${JSON.stringify({ success: false, error: result.error, exitCode })}\n`);
    process.exitCode = exitCode;
  }
}

function toRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (typeof data === "object" && data !== null) return [data as Record<string, unknown>];
  return [{ value: data }];
}

function printTable(data: unknown): void {
  const rows = toRows(data);
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]);

  // 列幅を1パスで計算
  const widths = keys.map((k) => k.length);
  const cells: string[][] = [];
  for (const row of rows) {
    const rowCells: string[] = [];
    for (let i = 0; i < keys.length; i++) {
      const s = String(row[keys[i]] ?? "");
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

function printCsv(data: unknown): void {
  const rows = toRows(data);
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  const parts: string[] = [keys.map(escapeCsvField).join(",")];
  for (const row of rows) {
    parts.push(keys.map((k) => escapeCsvField(String(row[k] ?? ""))).join(","));
  }
  process.stdout.write(`${parts.join("\n")}\n`);
}
