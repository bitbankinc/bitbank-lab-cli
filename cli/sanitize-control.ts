// 端末制御文字（C0 制御文字 + DEL）を \uXXXX へエスケープする純粋関数群。
// ANSI/ESC 等による端末描画の乗っ取り（出力スプーフィング）を防ぐ目的。
// error-sanitize.ts（エラー文字列）と output-tabular.ts（table/csv セル）で共有する。
// パス短縮・secret マスキング・truncate は含めない（正規データを壊すため）。

function escapeChar(c: string): string {
  return `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`;
}

// C0 制御文字 (0x00–0x1f) + DEL (0x7f) を全てエスケープ。
// biome-ignore lint/suspicious/noControlCharactersInRegex: 制御文字漏れの無害化が目的のため意図的
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/g;

export function escapeControlChars(input: string): string {
  return input.replace(CONTROL_CHAR_RE, escapeChar);
}

// CSV セル用。RFC 4180 / インジェクション防御がクォートで扱う TAB/CR/LF は
// 温存し、それ以外の制御文字（ESC 等のスプーフ源）だけをエスケープする。
// biome-ignore lint/suspicious/noControlCharactersInRegex: 制御文字漏れの無害化が目的のため意図的
const CSV_CONTROL_CHAR_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

export function escapeControlCharsForCsv(input: string): string {
  return input.replace(CSV_CONTROL_CHAR_RE, escapeChar);
}
