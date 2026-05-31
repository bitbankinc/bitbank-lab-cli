import { sanitizeErrorMessage } from "./error-sanitize.js";
import { isDryRunData, printDryRunBox } from "./output-dry-run.js";
import { printCsv, printTable } from "./output-tabular.js";
import type { Format, Result } from "./types.js";

export function output<T>(result: Result<T>, format: Format, raw = false, machine = false): void {
  if (machine) {
    machineOutput(result);
    return;
  }
  if (!result.success) {
    // index.ts の Fatal 経路と整合させ、human stderr でも制御文字/secret/パスを無害化
    process.stderr.write(`Error: ${sanitizeErrorMessage(result.error)}\n`);
    process.exitCode = result.exitCode ?? 1;
    return;
  }
  // dry-run プレビューは human では整形ボックスで表示（machine は冒頭の envelope 経路）。
  if (isDryRunData(result.data)) {
    printDryRunBox(result.data);
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
      // 既定 json は envelope（meta 込み）を pretty 出力。--raw のときだけ data のみ compact。
      process.stdout.write(
        `${JSON.stringify(raw ? data : successEnvelope(result), null, raw ? undefined : 2)}\n`,
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

/** 成功 Result を { success, data, partial?, meta? } envelope に変換する。
 *  既定 json（pretty）と --machine（compact）で共通の形を保証する。 */
function successEnvelope<T>(r: Extract<Result<T>, { success: true }>): Record<string, unknown> {
  const env: Record<string, unknown> = { success: true, data: r.data };
  if (r.partial) env.partial = true;
  if (r.meta) env.meta = r.meta;
  return env;
}

export function machineOutput<T>(result: Result<T>): void {
  if (result.success) {
    process.stdout.write(`${JSON.stringify(successEnvelope(result))}\n`);
  } else {
    const exitCode = result.exitCode ?? 1;
    process.stdout.write(`${JSON.stringify({ success: false, error: result.error, exitCode })}\n`);
    process.exitCode = exitCode;
  }
}
