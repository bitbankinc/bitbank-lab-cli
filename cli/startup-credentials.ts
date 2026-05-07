import type { ApiCredentials } from "./auth.js";
import { loadEnvProfile } from "./profile.js";
import { resolveCredentials } from "./profiles-resolver.js";
import { loadProfiles } from "./profiles-store.js";
import type { Result } from "./types.js";

/** CLI 起動時に 1 度だけ credentials を解決する。
 *
 * 優先順位（現行仕様を踏襲。本 PR で変更しない）:
 *   1. `--profile=<name>` flag → profiles.json に一致 → .env.<name> へフォールバック
 *   2. `BITBANK_PROFILE` env → profiles.json から lookup
 *   3. profiles.json の default profile
 *   4. legacy "BITBANK_API_KEY" / "BITBANK_API_SECRET" env vars
 *
 * credentials が見つからない場合は `data: undefined` を返す（public コマンド向け）。
 * private/trade コマンドが実際に creds を要求した時点で、HTTP helper が
 * 明示エラー（NOT_CONFIGURED）を返す。 */
export function resolveStartupCredentials(
  profileFlag: string | undefined,
): Result<ApiCredentials | undefined> {
  if (typeof profileFlag === "string") {
    const file = loadProfiles();
    if (file.success && Object.hasOwn(file.data.profiles, profileFlag)) {
      const p = file.data.profiles[profileFlag];
      return { success: true, data: { apiKey: p.key, apiSecret: p.secret } };
    }
    return loadEnvProfile(profileFlag);
  }
  const r = resolveCredentials();
  if (r.success) return { success: true, data: r.data };
  return { success: true, data: undefined };
}
