import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { ApiCredentials } from "./auth.js";
import { EXIT } from "./exit-codes.js";
import type { Result } from "./types.js";

/** グループ・他ユーザーに権限がある場合 stderr に警告を出す */
export function warnIfInsecure(filepath: string, filename: string): void {
  if (process.platform === "win32") return;
  try {
    const { mode } = statSync(filepath);
    if (mode & 0o077) {
      const octal = `0${(mode & 0o777).toString(8)}`;
      process.stderr.write(
        `Warning: ${filename} is readable by other users (mode: ${octal}). Run: chmod 600 ${filename}\n`,
      );
    }
  } catch {
    // stat に失敗した場合は警告をスキップ
  }
}

/** .env ファイルをパースして key=value の Record を返す */
export function parseEnvFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

const ALLOWED_KEYS = /^BITBANK_[A-Z0-9_]+$/;

/** .env.<profile> から credentials を読み出す。process.env は変更しない。
 * BITBANK_* 以外のキーは読み捨てて警告（PATH/LD_PRELOAD 等の上書き防止）。 */
export function loadEnvProfile(profile: string): Result<ApiCredentials> {
  if (!/^[A-Za-z0-9._-]+$/.test(profile) || profile.startsWith(".") || profile.includes("..")) {
    return { success: false, error: "Invalid profile name", exitCode: EXIT.PARAM };
  }
  const filename = `.env.${profile}`;
  const filepath = resolve(process.cwd(), filename);
  if (!existsSync(filepath)) {
    return {
      success: false,
      error: `Profile file not found: ${filename}`,
      exitCode: EXIT.PARAM,
    };
  }
  warnIfInsecure(filepath, filename);
  const content = readFileSync(filepath, "utf-8");
  const vars = parseEnvFile(content);
  const skipped: string[] = [];
  let apiKey: string | undefined;
  let apiSecret: string | undefined;
  for (const [key, val] of Object.entries(vars)) {
    if (!ALLOWED_KEYS.test(key)) {
      skipped.push(key);
      continue;
    }
    if (key === "BITBANK_API_KEY") apiKey = val;
    else if (key === "BITBANK_API_SECRET") apiSecret = val;
  }
  if (skipped.length > 0) {
    process.stderr.write(
      `Warning: ignored non-BITBANK_* keys in ${filename}: ${skipped.join(", ")}\n`,
    );
  }
  if (!apiKey || !apiSecret) {
    return {
      success: false,
      error: `${filename} must define "BITBANK_API_KEY" and "BITBANK_API_SECRET"`,
      exitCode: EXIT.AUTH,
    };
  }
  return { success: true, data: { apiKey, apiSecret } };
}
