// `bitbank --version` / `-v`。API は叩かず package.json の version を返すメタ経路。
// package.json の version は開発ツリーでは 0.0.0-dev で、release.yml が tag push 時に
// 注入する（docs/dev/release.md）。fnm 等で Node ごとにグローバル install が分かれ
// 「シェルと launchd で別バージョンの bitbank が動いていた」を 1 コマンドで見分ける
// ための入口（issue #28）。
import { readFileSync } from "node:fs";
import { z } from "zod";
import { sanitizeErrorMessage } from "../error-sanitize.js";
import { EXIT } from "../exit-codes.js";
import { machineOutput } from "../output.js";
import type { Result } from "../types.js";

const PackageVersionSchema = z.object({ version: z.string().min(1) });

export type VersionInfo = z.infer<typeof PackageVersionSchema>;

export function readVersion(
  pkgUrl: URL = new URL("../../package.json", import.meta.url),
): Result<VersionInfo> {
  try {
    const parsed = PackageVersionSchema.safeParse(JSON.parse(readFileSync(pkgUrl, "utf-8")));
    if (!parsed.success) {
      return { success: false, error: "package.json has no version field", exitCode: EXIT.GENERAL };
    }
    return { success: true, data: { version: parsed.data.version } };
  } catch (e) {
    return {
      success: false,
      error: `Failed to read package.json: ${sanitizeErrorMessage(e)}`,
      exitCode: EXIT.GENERAL,
    };
  }
}

/** human は version 文字列だけを stdout に出す（他 CLI と同じ流儀）。
 *  --machine は他コマンドと同じ envelope（`{"success":true,"data":{"version":...}}`）。 */
export function versionHandler(machine: boolean): void {
  const r = readVersion();
  if (machine) {
    machineOutput(r);
    return;
  }
  if (!r.success) {
    process.stderr.write(`Error: ${r.error}\n`);
    process.exitCode = r.exitCode ?? EXIT.GENERAL;
    return;
  }
  process.stdout.write(`${r.data.version}\n`);
}
