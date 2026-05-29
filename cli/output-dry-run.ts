import type { DryRunData } from "./types.js";

/** result.data が trade dry-run のプレビューか判定する type guard。
 *  human 経路の分岐と監査ログのスキップ判定に使うため、dryRun フラグだけでなく
 *  shape も検証して fail-closed にする（実 API レスポンスの誤判定を防ぐ）。 */
export function isDryRunData(data: unknown): data is DryRunData {
  if (typeof data !== "object" || data === null) return false;
  const v = data as Record<string, unknown>;
  return (
    v.dryRun === true &&
    typeof v.endpoint === "string" &&
    typeof v.executeHint === "string" &&
    typeof v.body === "object" &&
    v.body !== null &&
    (v.confirmPhrase === undefined || typeof v.confirmPhrase === "string")
  );
}

/** human 向け: 従来の DRY RUN 整形ボックスを stdout に描画する。
 *  body は dryRunResult 側で機微フラグをマスク済みなので、ここでは整形だけ行う。 */
export function printDryRunBox(data: DryRunData): void {
  const lines = [
    "🔍 DRY RUN（実際のAPIは叩きません）",
    "",
    "リクエスト内容:",
    `  エンドポイント: POST ${data.endpoint}`,
    "  ボディ:",
  ];
  for (const [k, v] of Object.entries(data.body ?? {})) {
    lines.push(`    ${k}: ${JSON.stringify(v)}`);
  }
  lines.push("");
  lines.push(
    data.confirmPhrase
      ? `実行するには --execute と --confirm=${data.confirmPhrase} を付けてください:`
      : "実行するには --execute を付けてください:",
  );
  lines.push(`  ${data.executeHint}`);
  process.stdout.write(`${lines.join("\n")}\n`);
}
