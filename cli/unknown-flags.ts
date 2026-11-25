// merged（COMMON_OPTIONS + コマンド固有 options）確定後の parseArgs で、未知の
// long-flag（タイポ・存在しない flag）を検出するヘルパー。index.ts の 2 回目の
// parseArgs はコマンド未確定の 1 回目との兼ね合いで strict:false を維持するため、
// strict による拒否の代わりにトークンを走査して未知 flag を拾う。
// short-flag（-x）と `--` 区切りは対象外（rawName が "--" 始まりのみ判定）にして
// 従来挙動を保つ。

/** parseArgs({ tokens: true }) のトークンのうち、未知 flag 判定に必要な形だけを構造的に表す。 */
type ArgToken =
  | { kind: "option"; name: string; rawName: string }
  | { kind: "positional" | "option-terminator" };

/** known（merged）に無い long-flag の rawName を重複排除して返す。空配列なら未知 flag なし。 */
export function unknownLongFlags(
  tokens: readonly ArgToken[],
  known: Readonly<Record<string, unknown>>,
): string[] {
  // known は通常オブジェクト合成のため `in` ではなく Object.hasOwn を使う。`in` だと
  // toString / constructor / __proto__ 等のプロトタイプ継承プロパティが known 扱いになり、
  // --toString のような未知 flag を取りこぼす（in に戻さないこと）。
  const hits = tokens.flatMap((t) =>
    t.kind === "option" && t.rawName.startsWith("--") && !Object.hasOwn(known, t.name)
      ? [t.rawName]
      : [],
  );
  return [...new Set(hits)];
}

/** 未知 flag のうち、別のコマンドで使うべきものへの案内（コマンドの呼び出しパス → flag → 案内）。
 *  現物の paper create-order に --position-side が来たら、信用の paper create-margin-order へ案内する
 *  （本番 trade create-order について ADR-009 が決めたのと同じ考え方。ADR-010）。
 *  オプションとして登録して中で拒否すると、補完・help・agents カタログに使えない flag が載るので、
 *  未知 flag のエラー（PARAM）に案内を添える形にする。 */
const MISPLACED_FLAG_HINTS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "paper create-order": {
    "--position-side":
      "paper create-order は現物専用です。信用の注文は paper create-margin-order を使ってください",
  },
};

export function misplacedFlagHints(commandPath: string, unknown: readonly string[]): string[] {
  const hints = Object.hasOwn(MISPLACED_FLAG_HINTS, commandPath)
    ? MISPLACED_FLAG_HINTS[commandPath]
    : {};
  return unknown.flatMap((f) => (Object.hasOwn(hints, f) ? [hints[f]] : []));
}
