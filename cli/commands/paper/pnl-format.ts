// paper pnl の format 別出力（json / table / csv / --machine）。pnl.ts から分けた。
// 表と CSV は現物の行の後に信用（ADR-010）の行を続ける。信用の行の pair 欄は "btc_jpy long (margin)" の形で、
// 表では MARGIN TOTAL の行を足す（現物の TOTAL は現物だけの合計のまま）。
import { machineOutput } from "../../output.js";
import type { MarginPnlReport } from "../../paper-margin/pnl.js";
import type { PaperPnlReport } from "../../paper-pnl.js";
import type { Format, Result } from "../../types.js";

export type PaperPnlOutput = PaperPnlReport & { margin?: MarginPnlReport };

const COLS = [
  "pair",
  "position",
  "avgCost",
  "currentPrice",
  "realizedPnl",
  "unrealizedPnl",
  "totalPnl",
] as const;

export function formatPnl(
  result: Result<PaperPnlOutput>,
  format: Format,
  raw = false,
  machine = false,
): void {
  if (machine) {
    machineOutput(result);
    return;
  }
  if (!result.success) {
    process.stderr.write(`Error: ${result.error}\n`);
    process.exitCode = result.exitCode ?? 1;
    return;
  }
  const data = result.data;
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(data, raw ? undefined : null, raw ? undefined : 2)}\n`);
    return;
  }
  const pairRows = Object.values(data.perPair).map((r) => COLS.map((c) => String(r[c])));
  const marginRows = (data.margin?.perPosition ?? []).map((r) =>
    COLS.map((c) => (c === "pair" ? `${r.pair} ${r.positionSide} (margin)` : String(r[c]))),
  );
  if (format === "csv") {
    const lines = [COLS.join(","), ...[...pairRows, ...marginRows].map((r) => r.join(","))];
    process.stdout.write(`${lines.join("\n")}\n`);
    return;
  }
  const totalRow = [
    "TOTAL",
    "",
    "",
    "",
    String(data.total.realizedPnl),
    String(data.total.unrealizedPnl),
    String(data.total.totalPnl),
  ];
  const m = data.margin?.total;
  const marginTotalRow = m
    ? [
        "MARGIN TOTAL",
        "",
        "",
        "",
        String(m.realizedPnl),
        String(m.unrealizedPnl),
        String(m.totalPnl),
      ]
    : undefined;
  const widths = COLS.map((c) => c.length);
  for (const row of [
    ...pairRows,
    totalRow,
    ...marginRows,
    ...(marginTotalRow ? [marginTotalRow] : []),
  ]) {
    for (let i = 0; i < COLS.length; i++) {
      if (row[i].length > widths[i]) widths[i] = row[i].length;
    }
  }
  const line = (row: string[]) => row.map((s, i) => s.padEnd(widths[i])).join("  ");
  const sep = widths.map((w) => "-".repeat(w)).join("  ");
  const parts = [line([...COLS]), sep, ...pairRows.map(line), sep, line(totalRow)];
  if (marginTotalRow) parts.push(sep, ...marginRows.map(line), sep, line(marginTotalRow));
  process.stdout.write(`${parts.join("\n")}\n`);
}
